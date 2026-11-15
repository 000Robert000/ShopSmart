import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function AccountPage() {
  const { customer, checking, logout } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customer) return undefined;
    let active = true;
    api.getMyOrders()
      .then((data) => { if (active) setOrders(data.orders); })
      .catch((caught) => { if (active) setError(caught.message); });
    return () => { active = false; };
  }, [customer]);

  if (checking) return <StatusMessage>Checking your account…</StatusMessage>;
  if (!customer) return <Navigate to="/login?next=/account" replace />;

  return (
    <section>
      <p className="eyebrow">MY ACCOUNT</p>
      <h1>{customer.name}</h1>
      <p>{customer.email}</p>
      <button className="button secondary" onClick={logout}>Sign out</button>
      <h2>My orders</h2>
      <StatusMessage type="error">{error}</StatusMessage>
      {!orders && !error && <StatusMessage>Loading your orders…</StatusMessage>}
      {orders && orders.length === 0 && <p>No orders yet. <Link to="/">Browse products</Link></p>}
      {orders && orders.length > 0 && (
        <div className="cart-items">
          {orders.map((order) => (
            <article key={order.id} className="summary">
              <p><strong>Order #{order.id}</strong><span>{new Date(order.createdAt).toLocaleString('en-PH')}</span></p>
              {order.items.map((item) => (
                <p key={item.id}><span>{item.productName} × {item.quantity}</span><span>{peso(item.unitPrice * item.quantity)}</span></p>
              ))}
              <p className="summary-total"><span>Total ({order.status.toLowerCase()})</span><strong>{peso(order.total)}</strong></p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
