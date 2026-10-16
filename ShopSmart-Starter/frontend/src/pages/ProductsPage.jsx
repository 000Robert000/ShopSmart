import { useEffect, useMemo, useState } from 'react';
import ProductCard from '../components/ProductCard.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../services/api.js';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortOption, setSortOption] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addToCart, cartMessage } = useCart();

  useEffect(() => {
    let active = true;
    api.getProducts('')
      .then((data) => {
        if (active && data.products) {
          const uniqueCategories = ['All', ...new Set(data.products.map((p) => p.category))];
          setCategories(uniqueCategories);
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    api.getProducts(search.trim())
      .then((data) => {
        if (active && data.products) {
          setProducts(data.products);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => { active = false; };
  }, [search]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      return matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      const priceA = Number(a.price);
      const priceB = Number(b.price);

      if (sortOption === 'price-low-high') return priceA - priceB;
      if (sortOption === 'price-high-low') return priceB - priceA;
      if (sortOption === 'name-a-z') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [products, category, sortOption]);

  return (
    <section>
      <div className="hero">
        <div>
          <p className="eyebrow">BSIT FULL-STACK PROJECT</p>
          <h1>Technology for study, work and play</h1>
          <p>Browse the starter catalog, build a cart and complete a simulated order.</p>
        </div>
      </div>

      <div className="toolbar">
        <label>
          <span>Search products</span>
          <input 
            value={search} 
            onChange={(event) => setSearch(event.target.value)} 
            placeholder="Try keyboard" 
          />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Sort by</span>
          <select value={sortOption} onChange={(event) => setSortOption(event.target.value)}>
            <option value="default">Default</option>
            <option value="price-low-high">Price: Low to High</option>
            <option value="price-high-low">Price: High to Low</option>
            <option value="name-a-z">Name: A to Z</option>
          </select>
        </label>
      </div>

      <StatusMessage>{cartMessage}</StatusMessage>
      {loading && <StatusMessage>Loading products…</StatusMessage>}
      {error && <StatusMessage type="error">{error} Make sure the backend is running.</StatusMessage>}
      {!loading && !error && visibleProducts.length === 0 && <StatusMessage>No products match your filters.</StatusMessage>}

      <div className="product-grid">
        {visibleProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAddToCart={addToCart} />
        ))}
      </div>
    </section>
  );
}