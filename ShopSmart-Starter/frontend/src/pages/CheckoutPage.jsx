import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../services/api.js';

export default function CheckoutPage() {
  const { cart, total, clearCart } = useCart();
  const { customer, checking } = useAuth();
  const [form, setForm] = useState({ customerName: customer?.name || '', address: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitOrder(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const created = await api.createOrder({
        ...form,
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      });
      setOrder(created);
      clearCart();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (order) return (
    <section className="success-card">
      <p className="eyebrow">ORDER RECEIVED</p>
      <h1>Thank you, {order.customerName}!</h1>
      <p>Your simulated order number is <strong>#{order.id}</strong>.</p>
      <p>Total: <strong>₱{Number(order.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></p>
      <p><Link className="button" to="/">Continue shopping</Link> <Link className="button secondary" to="/account">View my orders</Link></p>
    </section>
  );

  if (cart.length > 0 && checking) return <StatusMessage>Checking your account…</StatusMessage>;
  if (cart.length > 0 && !customer) return (
    <section><div className="empty-state">
      <h1>Sign in to check out</h1>
      <p>Orders are saved to your account so only you can see them. Your cart will still be here.</p>
      <Link className="button" to="/login?next=/checkout">Sign in or create an account</Link>
    </div></section>
  );

  if (cart.length === 0) return <section><div className="empty-state"><h1>Your cart is empty</h1><Link className="button" to="/">Browse products</Link></div></section>;

  return (
    <section className="checkout-layout">
      <form onSubmit={submitOrder}>
        <p className="eyebrow">SIMULATED CHECKOUT</p><h1>Delivery information</h1>
        <StatusMessage type="error">{error}</StatusMessage>
        <label>Full name<input name="customerName" value={form.customerName} onChange={updateField} minLength="2" maxLength="80" required /></label>
        <p>Signed in as <strong>{customer.email}</strong>. The order confirmation uses this email.</p>
        <label>Delivery address<textarea name="address" value={form.address} onChange={updateField} minLength="10" maxLength="300" required /></label>
        <button disabled={submitting}>{submitting ? 'Submitting order…' : 'Place simulated order'}</button>
      </form>
      <aside className="summary">
        <h2>Order summary</h2>
        <div className="checkout-items" style={{ marginBottom: '1rem' }}>
          {cart.map((item) => (
            <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              <div>
                <strong>{item.name}</strong>
                <div>Qty: {item.quantity} × ₱{item.price.toLocaleString('en-PH')}</div>
              </div>
              <div>₱{(item.price * item.quantity).toLocaleString('en-PH')}</div>
            </div>
          ))}
        </div>
        <p className="summary-total"><span>Total</span><strong>₱{total.toLocaleString('en-PH')}</strong></p>
        <small>No actual payment will be collected.</small>
      </aside>
    </section>
  );
}