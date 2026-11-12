import { useState } from 'react';
import { PlanPage } from './components/PlanPage';
import { PlansPage } from './components/PlansPage';
import { ProductsPage } from './components/ProductsPage';
import { ProfilePage } from './components/ProfilePage';
import { load, save } from './lib/storage';

type Page = 'plan' | 'plans' | 'products' | 'profile';
const NAV: { id: Page; label: string }[] = [
  { id: 'plan', label: 'Planen' },
  { id: 'plans', label: 'Pläne' },
  { id: 'products', label: 'Produkte' },
  { id: 'profile', label: 'Profil' },
];

export default function App() {
  const [page, setPageState] = useState<Page>(() => load<Page>('page', 'plan'));
  const setPage = (p: Page) => {
    setPageState(p);
    save('page', p);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
          <span>FuelR</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? 'on' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => setPage(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {page === 'plan' && <PlanPage onGoto={setPage} />}
        {page === 'plans' && <PlansPage onOpen={() => setPage('plan')} />}
        {page === 'products' && <ProductsPage />}
        {page === 'profile' && <ProfilePage />}
      </main>
    </div>
  );
}
