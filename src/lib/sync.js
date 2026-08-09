import { Peer } from 'peerjs';

class SyncEngine {
  constructor(notify, onSyncUpdate) {
    this.notify = notify;
    this.onSyncUpdate = onSyncUpdate; // Callback to update parent DB state: (newDb) => void
    this.peer = null;
    this.connections = {}; // deviceId -> dataConnection mapping
    this.db = null; // Current DB state
    this.lastBroadcastedDb = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.online = false;
  }

  // Set the current DB state (called by App.jsx useEffect on local DB change)
  onLocalUpdate(db) {
    this.db = db;
    if (!db.settings.onlineMode || !db.syncConfig || !db.syncConfig.shopId) {
      this.stop();
      return;
    }

    // Initialize or re-initialize Peer if sync config changed
    const config = db.syncConfig;
    const shouldStart = db.settings.onlineMode && config.shopId && config.role;

    if (shouldStart && (!this.peer || this.peer.destroyed || this.currentPeerId() !== this.getTargetPeerId(config))) {
      this.start(config);
    }

    // Broadcast local changes to peers if DB changed and we are connected
    if (this.online && this.lastBroadcastedDb) {
      const changes = this.detectChanges(this.lastBroadcastedDb, db);
      if (changes) {
        this.broadcast({ type: 'delta_update', changes, senderDeviceId: config.deviceId });
      }
    }
    this.lastBroadcastedDb = JSON.parse(JSON.stringify(db));
  }

  currentPeerId() {
    return this.peer ? this.peer.id : null;
  }

  getTargetPeerId(config) {
    if (config.role === 'owner') {
      return `datapharm-${config.shopId}-owner`;
    } else {
      return `datapharm-${config.shopId}-worker-${config.deviceId}`;
    }
  }

  start(config) {
    this.stop();
    const peerId = this.getTargetPeerId(config);
    console.log('[Sync] Starting peer with ID:', peerId);

    // Create the Peer connection
    this.peer = new Peer(peerId, {
      host: '0.peerjs.com',
      port: 443,
      path: '/',
      secure: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log('[Sync] Peer opened successfully. ID:', id);
      this.online = true;
      this.notify('Sync engine connected online');
      
      if (config.role === 'worker') {
        this.connectToOwner(config);
      }
      this.startHeartbeat();
    });

    this.peer.on('connection', (conn) => {
      console.log('[Sync] Received incoming connection request from:', conn.peer);
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('[Sync] Peer error:', err);
      if (err.type === 'unavailable-id') {
        this.notify('Connection conflict: ID already in use', 'err');
      } else {
        this.notify('Sync engine connection error', 'err');
      }
      this.scheduleReconnect(config);
    });

    this.peer.on('close', () => {
      console.log('[Sync] Peer closed.');
      this.online = false;
      this.scheduleReconnect(config);
    });
  }

  stop() {
    this.online = false;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Close all connections
    Object.values(this.connections).forEach(conn => conn.close());
    this.connections = {};

    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
      this.peer = null;
      console.log('[Sync] Peer destroyed.');
    }
  }

  connectToOwner(config) {
    const ownerId = `datapharm-${config.shopId}-owner`;
    console.log('[Sync] Attempting to connect to owner:', ownerId);
    
    const conn = this.peer.connect(ownerId, {
      reliable: true
    });
    this.setupConnection(conn);
  }

  setupConnection(conn) {
    conn.on('open', () => {
      console.log('[Sync] Data connection opened with:', conn.peer);
      
      // If we are a worker, immediately send auth credentials
      const config = this.db.syncConfig;
      if (config.role === 'worker') {
        conn.send({
          type: 'auth',
          deviceId: config.deviceId,
          deviceName: config.deviceName || 'Worker Device',
          token: config.syncToken
        });
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingData(conn, data);
    });

    conn.on('close', () => {
      console.log('[Sync] Connection closed with:', conn.peer);
      this.removeConnection(conn);
    });

    conn.on('error', (err) => {
      console.error('[Sync] Connection error for peer:', conn.peer, err);
      this.removeConnection(conn);
    });
  }

  removeConnection(conn) {
    // Find the device ID associated with this connection
    const entry = Object.entries(this.connections).find(([_, c]) => c.peer === conn.peer);
    if (entry) {
      const [deviceId, _] = entry;
      delete this.connections[deviceId];
      console.log('[Sync] Removed connection for device:', deviceId);
      
      // Update worker list lastSeen time for owners
      if (this.db.syncConfig.role === 'owner') {
        const updatedWorkers = this.db.syncConfig.workers.map(w => 
          w.deviceId === deviceId ? { ...w, status: 'offline', lastSeen: Date.now() } : w
        );
        this.onSyncUpdate({
          ...this.db,
          syncConfig: { ...this.db.syncConfig, workers: updatedWorkers }
        });
      }
    }
  }

  handleIncomingData(conn, data) {
    const config = this.db.syncConfig;
    console.log('[Sync] Received message:', data.type, 'from:', conn.peer);

    switch (data.type) {
      case 'auth':
        // Owner processes worker auth
        if (config.role === 'owner') {
          const { deviceId, deviceName, token } = data;
          if (token === config.syncToken) {
            // Check if worker was revoked
            const workerRecord = config.workers.find(w => w.deviceId === deviceId);
            if (workerRecord && workerRecord.status === 'revoked') {
              conn.send({ type: 'auth_fail', reason: 'revoked' });
              conn.close();
              return;
            }

            // Save worker connection
            this.connections[deviceId] = conn;
            console.log('[Sync] Authenticated worker device:', deviceId);
            
            // Add or update worker in configuration list
            const existing = config.workers.find(w => w.deviceId === deviceId);
            let updatedWorkers = [...config.workers];
            if (existing) {
              updatedWorkers = updatedWorkers.map(w => 
                w.deviceId === deviceId ? { ...w, deviceName, status: 'online', lastSeen: Date.now() } : w
              );
            } else {
              updatedWorkers.push({
                deviceId,
                deviceName,
                status: 'online',
                lastSeen: Date.now(),
                dailyVerification: false,
                expiryTime: ''
              });
            }

            // Save updated state and notify
            this.onSyncUpdate({
              ...this.db,
              syncConfig: { ...this.db.syncConfig, workers: updatedWorkers }
            });

            this.notify(`Worker "${deviceName}" connected`);

            // Confirm auth and send back worker's specific access controls
            const myRecord = updatedWorkers.find(w => w.deviceId === deviceId);
            conn.send({
              type: 'auth_ok',
              deviceId: config.deviceId,
              deviceName: config.deviceName,
              expiryTime: myRecord.expiryTime,
              dailyVerification: myRecord.dailyVerification
            });

            // Start sync exchange: send our db summary to the worker
            this.sendSyncStart(conn);
          } else {
            console.warn('[Sync] Auth failed for worker: Invalid token');
            conn.send({ type: 'auth_fail', reason: 'invalid_token' });
            conn.close();
          }
        }
        break;

      case 'auth_ok':
        // Worker processes auth success
        if (config.role === 'worker') {
          this.connections['owner'] = conn;
          this.notify('Paired with owner');
          
          // Apply access control settings returned by owner
          this.onSyncUpdate({
            ...this.db,
            syncConfig: {
              ...this.db.syncConfig,
              expiryTime: data.expiryTime || '',
              dailyVerification: !!data.dailyVerification
            }
          });

          // Start sync exchange: send our db summary to the owner
          this.sendSyncStart(conn);
        }
        break;

      case 'auth_fail':
        if (config.role === 'worker') {
          this.notify(`Access denied: ${data.reason === 'revoked' ? 'Revoked by owner' : 'Invalid pairing token'}`, 'err');
          if (data.reason === 'revoked') {
            this.onSyncUpdate({
              ...this.db,
              syncConfig: { ...this.db.syncConfig, status: 'revoked' }
            });
          }
          this.stop();
        }
        break;

      case 'sync_start':
        // Send a sync_request asking for anything we need or that is outdated
        this.processSyncStart(conn, data.summary);
        break;

      case 'sync_request':
        // Respond with the full records requested by peer
        this.sendSyncResponse(conn, data.request);
        break;

      case 'sync_response':
        // Merge the incoming full records into our local database
        this.applySyncResponse(data.payload);
        break;

      case 'delta_update':
        // Apply an instant delta update (e.g. sale checkout stock deduction)
        this.applyDeltaUpdate(data.changes, data.senderDeviceId);
        break;

      case 'ping':
        conn.send({ type: 'pong' });
        break;

      case 'pong':
        // Heartbeat response, connection is healthy
        break;

      default:
        console.warn('[Sync] Unknown message type:', data.type);
    }
  }

  sendSyncStart(conn) {
    const summary = {
      products: this.db.products.map(p => ({ id: p.id, updatedAt: p.updatedAt || 0 })),
      sales: this.db.sales.map(s => s.id),
      stockIns: this.db.stockIns.map(si => si.id),
      tombstones: this.db.tombstones || [],
      categories: this.db.categories
    };
    conn.send({ type: 'sync_start', summary });
  }

  processSyncStart(conn, peerSummary) {
    const localProducts = this.db.products;
    const localSales = this.db.sales;
    const localStockIns = this.db.stockIns;
    const localTombstones = this.db.tombstones || [];

    const request = {
      productIds: [],
      saleIds: [],
      stockInIds: []
    };

    // 1. Check products we need or that are outdated
    peerSummary.products.forEach(peerP => {
      // If peer has a tombstone for it, we don't ask
      if (localTombstones.some(t => t.id === peerP.id) || peerSummary.tombstones.some(t => t.id === peerP.id)) {
        return;
      }
      const localP = localProducts.find(p => p.id === peerP.id);
      if (!localP || (peerP.updatedAt > (localP.updatedAt || 0))) {
        request.productIds.push(peerP.id);
      }
    });

    // 2. Check sales we don't have
    peerSummary.sales.forEach(id => {
      if (!localSales.some(s => s.id === id)) {
        request.saleIds.push(id);
      }
    });

    // 3. Check stockIns we don't have
    peerSummary.stockIns.forEach(id => {
      if (!localStockIns.some(si => si.id === id)) {
        request.stockInIds.push(id);
      }
    });

    // Send the request. If we don't need anything, request lists will be empty.
    conn.send({ type: 'sync_request', request });

    // Also proactively push any products, sales, or stockIns we have that are newer or missing on peer
    const pushPayload = {
      products: localProducts.filter(localP => {
        const peerP = peerSummary.products.find(p => p.id === localP.id);
        return !peerSummary.tombstones.some(t => t.id === localP.id) && 
               (!peerP || ((localP.updatedAt || 0) > peerP.updatedAt));
      }),
      sales: localSales.filter(localS => !peerSummary.sales.includes(localS.id)),
      stockIns: localStockIns.filter(localSI => !peerSummary.stockIns.includes(localSI.id)),
      tombstones: localTombstones.filter(localT => !peerSummary.tombstones.some(t => t.id === localT.id)),
      categories: this.db.categories.filter(c => !peerSummary.categories.includes(c))
    };

    if (pushPayload.products.length > 0 || pushPayload.sales.length > 0 || 
        pushPayload.stockIns.length > 0 || pushPayload.tombstones.length > 0 || 
        pushPayload.categories.length > 0) {
      conn.send({ type: 'sync_response', payload: pushPayload });
    }
  }

  sendSyncResponse(conn, request) {
    const responsePayload = {
      products: this.db.products.filter(p => request.productIds.includes(p.id)),
      sales: this.db.sales.filter(s => request.saleIds.includes(s.id)),
      stockIns: this.db.stockIns.filter(si => request.stockInIds.includes(si.id)),
      tombstones: [],
      categories: []
    };
    conn.send({ type: 'sync_response', payload: responsePayload });
  }

  applySyncResponse(payload) {
    console.log('[Sync] Applying sync response. Products:', payload.products.length, 'Sales:', payload.sales.length);
    let dbChanged = false;
    let nextDb = { ...this.db };

    // 1. Merge tombstones
    if (payload.tombstones && payload.tombstones.length > 0) {
      const currentTombstones = nextDb.tombstones || [];
      const newTombstones = payload.tombstones.filter(t => !currentTombstones.some(ct => ct.id === t.id));
      if (newTombstones.length > 0) {
        nextDb.tombstones = [...currentTombstones, ...newTombstones];
        dbChanged = true;
      }
    }

    const activeTombstones = nextDb.tombstones || [];

    // 2. Merge products
    if (payload.products && payload.products.length > 0) {
      const mergedProducts = [...nextDb.products];
      payload.products.forEach(peerP => {
        // If product is deleted (has tombstone), remove it
        if (activeTombstones.some(t => t.id === peerP.id)) {
          const idx = mergedProducts.findIndex(p => p.id === peerP.id);
          if (idx !== -1) {
            mergedProducts.splice(idx, 1);
            dbChanged = true;
          }
          return;
        }

        const idx = mergedProducts.findIndex(p => p.id === peerP.id);
        if (idx === -1) {
          mergedProducts.push(peerP);
          dbChanged = true;
        } else if ((peerP.updatedAt || 0) > (mergedProducts[idx].updatedAt || 0)) {
          mergedProducts[idx] = peerP;
          dbChanged = true;
        }
      });
      nextDb.products = mergedProducts;
    }

    // 3. Delete any products that are newly tombstoned locally
    if (activeTombstones.length > 0) {
      const origCount = nextDb.products.length;
      nextDb.products = nextDb.products.filter(p => !activeTombstones.some(t => t.id === p.id));
      if (nextDb.products.length !== origCount) {
        dbChanged = true;
      }
    }

    // 4. Merge sales (sales are immutable, union by ID)
    if (payload.sales && payload.sales.length > 0) {
      const currentSales = nextDb.sales;
      const newSales = payload.sales.filter(s => !currentSales.some(cs => cs.id === s.id));
      if (newSales.length > 0) {
        nextDb.sales = [...newSales, ...currentSales].sort((a, b) => b.ts - a.ts); // sort newest first
        dbChanged = true;
      }
    }

    // 5. Merge stockIns
    if (payload.stockIns && payload.stockIns.length > 0) {
      const currentStockIns = nextDb.stockIns;
      const newStockIns = payload.stockIns.filter(si => !currentStockIns.some(csi => csi.id === si.id));
      if (newStockIns.length > 0) {
        nextDb.stockIns = [...newStockIns, ...currentStockIns].sort((a, b) => b.ts - a.ts);
        dbChanged = true;
      }
    }

    // 6. Merge categories
    if (payload.categories && payload.categories.length > 0) {
      const currentCategories = nextDb.categories;
      const newCats = payload.categories.filter(c => !currentCategories.includes(c));
      if (newCats.length > 0) {
        nextDb.categories = [...currentCategories, ...newCats];
        dbChanged = true;
      }
    }

    if (dbChanged) {
      this.onSyncUpdate(nextDb);
    }
  }

  applyDeltaUpdate(changes, senderDeviceId) {
    if (senderDeviceId === this.db.syncConfig.deviceId) return;
    this.applySyncResponse(changes);
  }

  detectChanges(oldDb, newDb) {
    // Only detect changes in inventory, sales, stock-ins, categories, tombstones
    const changes = {
      products: [],
      sales: [],
      stockIns: [],
      tombstones: [],
      categories: []
    };

    // 1. Find new or updated products
    newDb.products.forEach(newP => {
      const oldP = oldDb.products.find(p => p.id === newP.id);
      if (!oldP || (newP.updatedAt || 0) > (oldP.updatedAt || 0)) {
        changes.products.push(newP);
      }
    });

    // 2. Find new tombstones (deleted products)
    const newTombstones = newDb.tombstones || [];
    const oldTombstones = oldDb.tombstones || [];
    newTombstones.forEach(nt => {
      if (!oldTombstones.some(ot => ot.id === nt.id)) {
        changes.tombstones.push(nt);
      }
    });

    // 3. Find new sales
    newDb.sales.forEach(newS => {
      if (!oldDb.sales.some(s => s.id === newS.id)) {
        changes.sales.push(newS);
      }
    });

    // 4. Find new stock-ins
    newDb.stockIns.forEach(newSI => {
      if (!oldDb.stockIns.some(si => si.id === newSI.id)) {
        changes.stockIns.push(newSI);
      }
    });

    // 5. Find new categories
    newDb.categories.forEach(c => {
      if (!oldDb.categories.includes(c)) {
        changes.categories.push(c);
      }
    });

    const hasChanges = changes.products.length > 0 || changes.sales.length > 0 || 
                      changes.stockIns.length > 0 || changes.tombstones.length > 0 || 
                      changes.categories.length > 0;

    return hasChanges ? changes : null;
  }

  broadcast(message) {
    Object.values(this.connections).forEach(conn => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  startHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.broadcast({ type: 'ping' });
    }, 10000); // Send ping every 10 seconds
  }

  scheduleReconnect(config) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (!this.db || !this.db.settings.onlineMode) return;
    
    console.log('[Sync] Scheduling reconnect in 5 seconds...');
    this.reconnectTimer = setTimeout(() => {
      if (this.db && this.db.settings.onlineMode) {
        this.start(config);
      }
    }, 5000);
  }
}

export default SyncEngine;
