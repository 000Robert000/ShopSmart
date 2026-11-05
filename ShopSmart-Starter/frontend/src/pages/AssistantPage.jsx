import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/api.js';

export default function AssistantPage() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask(event) {
    event.preventDefault(); 
    setError(''); 
    setResult(null); 
    setLoading(true);

    try { 
      const responseData = await api.askAssistant(question);
      setResult(responseData); 
    } catch (caught) { 
      setError(caught.message); 
    } finally { 
      setLoading(false); 
    }
  }

  const productList = result?.recommendedProducts || result?.products || [];

  return (
    <section className="assistant-layout">
      <div>
        <p className="eyebrow">STARTER ASSISTANT</p>
        <h1>Find a product</h1>
        <p>Search across our catalog of products using AI by R.A.B.S.</p>
        <form onSubmit={ask}>
          <label>
            Your question
            <textarea 
              value={question} 
              onChange={(event) => setQuestion(event.target.value)} 
              minLength="3" 
              maxLength="300" 
              placeholder="Try asking: Which keyboard is below ₱2,000?" 
              required 
            />
          </label>
          <button disabled={loading}>{loading ? 'Searching…' : 'Ask ShopSmart'}</button>
        </form>
      </div>
      <div className="assistant-answer">
        <h2>Assistant response</h2>
        <StatusMessage type="error">{error}</StatusMessage>
        {!result && !error && <p>Your answer will appear here.</p>}
        {result && (
          <>
            <p>{result.answer}</p>
            {Array.isArray(productList) && productList.length > 0 && (
              <div className="recommendations">
                {productList.map((product) => (
                  <Link key={product.id || product.name} to={`/products/${product.id}`}>
                    {product.name} — ₱{Number(product.price || 0).toLocaleString('en-PH')}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}