import { useState } from 'react';
import { EXAMPLE_PRODUCTS, uid, usePersistent } from '../lib/storage';
import type { CarbRatio, Product, ProductType } from '../lib/types';
import { Card, Field, Icon, NumField, Segmented, Toggle } from './ui';

export const TYPE_LABEL: Record<ProductType, string> = { drink: 'Iso-Drink', gel: 'Gel', chew: 'Chews', bar: 'Riegel' };
export const RATIO_LABEL: Record<CarbRatio, string> = { '2:1': '2:1', '1:0.8': '1:0,8', glucose: 'nur Glukose/Malto', other: 'unbekannt' };

const empty = (type: ProductType = 'gel'): Product => ({
  id: '',
  name: '',
  type,
  carbsG: type === 'drink' ? 40 : 25,
  ratio: '2:1',
  sodiumMg: type === 'drink' ? 300 : 50,
  caffeineMg: 0,
  servingMl: type === 'drink' ? 500 : undefined,
  isotonic: false,
});

export function ProductsPage() {
  const [products, setProducts] = usePersistent<Product[]>('products', EXAMPLE_PRODUCTS);
  const [editing, setEditing] = useState<Product | null>(null);

  const saveProduct = (p: Product) => {
    if (!p.name.trim()) return;
    setProducts((list) => (p.id ? list.map((x) => (x.id === p.id ? { ...p, example: false } : x)) : [...list, { ...p, id: uid() }]));
    setEditing(null);
  };

  const groups: ProductType[] = ['drink', 'gel', 'chew', 'bar'];
  const hasExamples = products.some((p) => p.example);

  return (
    <div className="page">
      <div className="page-intro">
        <h1>Produkte</h1>
        <p>Deine Iso-Drinks, Gels, Chews und Riegel mit Nährwerten laut Packung. Diese Produkte stehen dir beim Planen zur Auswahl.</p>
      </div>

      <div className="row-actions">
        <button className="btn" onClick={() => setEditing(empty('gel'))}>
          {Icon.plus} Produkt hinzufügen
        </button>
        {hasExamples && (
          <button className="btn ghost" onClick={() => setProducts((l) => l.filter((p) => !p.example))}>
            Beispielprodukte entfernen
          </button>
        )}
      </div>

      {editing && <ProductForm initial={editing} onCancel={() => setEditing(null)} onSave={saveProduct} />}

      {groups.map((g) => {
        const list = products.filter((p) => p.type === g);
        if (!list.length) return null;
        return (
          <Card key={g} title={TYPE_LABEL[g] + (g === 'drink' ? 's' : g === 'gel' ? 's' : '')}>
            <div className="product-list">
              {list.map((p) => (
                <div key={p.id} className="product-row">
                  <div className="product-main">
                    <div className="product-name">
                      {p.name} {p.example && <span className="badge">Beispiel</span>}
                    </div>
                    <div className="product-meta">
                      <span className="chip carb">{p.carbsG} g KH{p.type === 'drink' ? ` / ${p.servingMl ?? 500} ml` : ''}</span>
                      <span className="chip">{RATIO_LABEL[p.ratio]}</span>
                      {p.sodiumMg > 0 && <span className="chip salt">{p.sodiumMg} mg Na</span>}
                      {p.caffeineMg > 0 && <span className="chip caf">{p.caffeineMg} mg Koffein</span>}
                      {p.type === 'gel' && p.isotonic && <span className="chip water">isotonisch</span>}
                    </div>
                  </div>
                  <div className="product-actions">
                    <button className="btn small ghost" onClick={() => setEditing(p)}>
                      Bearbeiten
                    </button>
                    <button className="icon-btn" aria-label={`${p.name} löschen`} onClick={() => setProducts((l) => l.filter((x) => x.id !== p.id))}>
                      {Icon.trash}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ProductForm({ initial, onSave, onCancel }: { initial: Product; onSave: (p: Product) => void; onCancel: () => void }) {
  const [p, setP] = useState<Product>(initial);
  const set = (patch: Partial<Product>) => setP((x) => ({ ...x, ...patch }));

  return (
    <Card title={initial.id ? 'Produkt bearbeiten' : 'Neues Produkt'} className="editor">
      <div className="fields">
        <Field label="Typ" wide>
          <Segmented
            value={p.type}
            onChange={(type) => set({ type, servingMl: type === 'drink' ? p.servingMl ?? 500 : undefined })}
            options={(Object.keys(TYPE_LABEL) as ProductType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          />
        </Field>
        <Field label="Name" wide>
          <input autoFocus value={p.name} placeholder="z. B. Marke Gel Orange" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <NumField label={p.type === 'drink' ? 'KH pro Portion' : 'KH pro Stück'} unit="g" value={p.carbsG} min={0} max={200} onChange={(v) => set({ carbsG: v ?? 0 })} />
        {p.type === 'drink' && (
          <NumField label="Wasser pro Portion" unit="ml" value={p.servingMl} min={100} max={1500} onChange={(v) => set({ servingMl: v })} hint="Laut Packungsangabe" />
        )}
        <Field label="Verhältnis Glukose : Fruktose" wide>
          <Segmented value={p.ratio} onChange={(ratio) => set({ ratio })} options={(Object.keys(RATIO_LABEL) as CarbRatio[]).map((r) => ({ value: r, label: RATIO_LABEL[r] }))} />
        </Field>
        <NumField label="Natrium" unit="mg" value={p.sodiumMg} min={0} max={2000} onChange={(v) => set({ sodiumMg: v ?? 0 })} hint="1 g Salz ≈ 400 mg Natrium" />
        <NumField label="Koffein" unit="mg" value={p.caffeineMg} min={0} max={400} onChange={(v) => set({ caffeineMg: v ?? 0 })} />
      </div>
      {p.type === 'gel' && (
        <div className="toggles">
          <Toggle checked={!!p.isotonic} onChange={(v) => set({ isotonic: v })} label="Isotonisches Gel" hint="Kann ohne Wasser genommen werden" />
        </div>
      )}
      <div className="row-actions">
        <button className="btn" disabled={!p.name.trim()} onClick={() => onSave(p)}>
          Speichern
        </button>
        <button className="btn ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </Card>
  );
}
