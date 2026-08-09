import { useEffect, useState } from 'react';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import Sheet from './Sheet.jsx';
import { IconCamera } from './Icons.jsx';

export const CATEGORY_UNITS = {
  'Tablet':    { stock: 'In stock (strips)',   unit2: 'Tablets / strip',   price: 'Price / strip',  field1: 'strips', field2: 'tabletsPerStrip' },
  'Capsule':   { stock: 'In stock (strips)',   unit2: 'Capsules / strip',  price: 'Price / strip',  field1: 'strips', field2: 'tabletsPerStrip' },
  'Syrup':     { stock: 'In stock (bottles)',  unit2: 'ML / bottle',       price: 'Price / bottle', field1: 'strips', field2: 'tabletsPerStrip' },
  'Injection': { stock: 'In stock (vials)',    unit2: 'ML / vial',         price: 'Price / vial',   field1: 'strips', field2: 'tabletsPerStrip' },
  'Ointment':  { stock: 'In stock (tubes)',    unit2: 'Grams / tube',      price: 'Price / tube',   field1: 'strips', field2: 'tabletsPerStrip' },
  'Drops':     { stock: 'In stock (bottles)',  unit2: 'ML / bottle',       price: 'Price / bottle', field1: 'strips', field2: 'tabletsPerStrip' },
  'Powder':    { stock: 'In stock (packs)',    unit2: 'Grams / pack',      price: 'Price / pack',   field1: 'strips', field2: 'tabletsPerStrip' },
  'Other':     { stock: 'In stock (units)',    unit2: 'Unit size',         price: 'Price / unit',   field1: 'strips', field2: 'tabletsPerStrip' },
};

export const DEFAULT_UNITS = { stock: 'In stock', unit2: 'Units / pack', price: 'Price', field1: 'strips', field2: 'tabletsPerStrip' };

export default function ProductForm({ open, onClose, initial, onSubmit, notify, categories = [], onAddCategory }) {
  const isEdit = !!initial;
  const [f, setF] = useState(() =>
    initial
      ? { ...initial, barcode: initial.barcode || '' }
      : { name: '', expiry: '', price: '', location: '', buyFrom: '', strips: '', tabletsPerStrip: '', category: '', barcode: '' }
  );
  const [customCat, setCustomCat] = useState('');

  const selectedCategory = customCat.trim() || f.category;
  const unitLabels = CATEGORY_UNITS[selectedCategory] || DEFAULT_UNITS;

  useEffect(() => {
    if (open) {
      setF(
        initial
          ? { ...initial, barcode: initial.barcode || '' }
          : { name: '', expiry: '', price: '', location: '', buyFrom: '', strips: '', tabletsPerStrip: '', category: '', barcode: '' }
      );
      setCustomCat('');
    }
  }, [open, initial]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const scanBarcodeForForm = async () => {
    try {
      const { camera } = await BarcodeScanner.checkPermissions();
      if (camera !== 'granted') {
        const { camera: granted } = await BarcodeScanner.requestPermissions();
        if (granted !== 'granted') {
          if (notify) notify('Camera permission denied', 'err');
          return;
        }
      }

      try {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      } catch (e) {
        console.warn('Google Barcode Scanner Module notice:', e);
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.QrCode,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.DataMatrix,
        ],
      });

      if (barcodes && barcodes.length > 0) {
        const scannedValue = barcodes[0].rawValue;
        setF((prev) => ({ ...prev, barcode: scannedValue }));
        if (notify) notify('Barcode scanned!');
      }
    } catch (err) {
      if (notify) notify('Scan failed — try again', 'err');
      console.error('Barcode scan error:', err);
    }
  };

  const save = () => {
    const price = parseFloat(f.price);
    const strips = parseFloat(f.strips);
    const tps = parseInt(f.tabletsPerStrip, 10);
    if (!f.name.trim()) return notify('Enter a product name', 'err');
    if (!isEdit && !f.expiry) return notify('Set an expiry date', 'err');
    if (isEdit && Math.max(0, strips || 0) > 0 && !f.expiry) return notify('Set an expiry date', 'err');
    if (!(price > 0)) return notify('Enter a valid price per strip', 'err');
    if (!isEdit && !(strips > 0)) return notify('Enter the number of strips', 'err');
    if (!(tps > 0)) return notify('Tablets per strip must be at least 1', 'err');
    const category = (customCat.trim() || f.category || '').trim();
    if (category && onAddCategory && !categories.includes(category)) onAddCategory(category);
    const newStrips = isEdit ? Math.max(0, strips || 0) : strips;
    onSubmit(
      {
        name: f.name.trim(),
        expiry: newStrips <= 0 ? '' : f.expiry,
        price,
        location: f.location.trim(),
        buyFrom: f.buyFrom.trim(),
        strips: newStrips,
        tabletsPerStrip: tps,
        category,
        barcode: (f.barcode || '').trim(),
      },
      initial
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit product' : 'Add to stock'}
      footer={
        <button className="btn primary big" onClick={save}>
          {isEdit ? 'Save changes' : 'Add to stock'}
        </button>
      }
    >
      <div className="form">
        <label>
          Product name *
          <input value={f.name} onChange={set('name')} placeholder="e.g. Paracetamol 500mg" autoFocus />
        </label>
        <label>
          Category
          <div className="cat-chips">
            {categories.map((c) => (
              <button
                type="button"
                key={c}
                className={`cat-chip ${!customCat.trim() && f.category === c ? 'on' : ''}`}
                onClick={() => {
                  setF({ ...f, category: c });
                  setCustomCat('');
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </label>
        <label>
          New category
          <input
            value={customCat}
            onChange={(e) => {
              const v = e.target.value;
              setCustomCat(v);
              if (v.trim()) setF({ ...f, category: '' });
            }}
            placeholder="Or type a new category"
          />
        </label>
        <label>
          Location / shelf
          <input value={f.location} onChange={set('location')} placeholder="e.g. Shelf B2" />
        </label>
        <label>
          Barcode (optional)
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input value={f.barcode || ''} onChange={set('barcode')} placeholder="e.g. 8901234567890" style={{ flex: 1 }} />
            <button
              type="button"
              className="btn small"
              onClick={scanBarcodeForForm}
              title="Scan Barcode"
              style={{ padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <IconCamera size={16} />
            </button>
          </div>
        </label>
        <div className="form-row">
          <label>
            Expiry date *
            <input type="date" value={f.expiry} onChange={set('expiry')} />
          </label>
          <label>
            {unitLabels.price} *
            <input inputMode="decimal" value={f.price} onChange={set('price')} placeholder="0" />
          </label>
        </div>
        <div className="form-row">
          <label>
            {unitLabels.stock} {isEdit ? '(total)' : '*'}
            <input inputMode="decimal" value={f.strips} onChange={set('strips')} placeholder="0" />
          </label>
          <label>
            {unitLabels.unit2} *
            <input inputMode="numeric" value={f.tabletsPerStrip} onChange={set('tabletsPerStrip')} placeholder="10" />
          </label>
        </div>
        <label>
          Buy from (supplier)
          <input value={f.buyFrom} onChange={set('buyFrom')} placeholder="e.g. MedPlus Distributors" />
        </label>
      </div>
    </Sheet>
  );
}
