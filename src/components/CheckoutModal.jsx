import React, { useState, useEffect, useRef, useCallback } from 'react';
import Modal from './Modal';
import { useOrders } from '../hooks/useOrders';

const SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY || '0x4AAAAAADKkURAIh0TSp';

export default function CheckoutModal({ product, show, onClose }) {
  const [step, setStep] = useState('form');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrisData, setQrisData] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [orderStatus, setOrderStatus] = useState('pending');
  const [countdown, setCountdown] = useState(null);
  const [error, setError] = useState('');
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);
  const countdownRef = useRef(null);
  const { createOrder, updateOrder, listenToOrder } = useOrders();

  const resetTurnstile = useCallback(() => {
    if (window.turnstile && widgetIdRef.current !== null) {
      try { window.turnstile.reset(widgetIdRef.current); } catch {}
    }
    setTurnstileToken('');
    setTurnstileReady(false);
  }, []);

  useEffect(() => {
    if (!show) {
      setStep('form');
      setTurnstileToken('');
      setQrisData(null);
      setOrderId(null);
      setOrderStatus('pending');
      setError('');
      if (countdownRef.current) clearInterval(countdownRef.current);
      resetTurnstile();
    }
  }, [show, resetTurnstile]);

  useEffect(() => {
    if (step === 'form' && show) {
      const interval = setInterval(() => {
        if (window.turnstile && turnstileRef.current && !widgetIdRef.current) {
          widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
            sitekey: SITE_KEY,
            callback: (token) => { setTurnstileToken(token); setTurnstileReady(true); },
            'expired-callback': () => { setTurnstileToken(''); setTurnstileReady(false); },
          });
          clearInterval(interval);
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [step, show]);

  useEffect(() => {
    if (!orderId) return;
    const unsub = listenToOrder(orderId, (data) => {
      if (data.status === 'success') {
        setOrderStatus('success');
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [orderId, listenToOrder]);

  async function handleProcess() {
    if (!turnstileToken) { setError('Selesaikan verifikasi terlebih dahulu.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: product.price,
          productName: product.name,
          turnstileToken,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.message || 'Gagal membuat pembayaran.'); setLoading(false); resetTurnstile(); return; }

      const payData = json.data;
      setQrisData(payData);

      const expiryTime = payData.expiry_time
        ? new Date(payData.expiry_time).getTime()
        : Date.now() + 15 * 60 * 1000;

      setCountdown(Math.max(0, Math.floor((expiryTime - Date.now()) / 1000)));
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(countdownRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);

      const oid = await createOrder({
        productId: product.id,
        productName: product.name,
        price: product.price,
        orderId: payData.order_id || payData.orderId,
        expiryTime,
        method: 'QRIS',
      });
      setOrderId(oid);
      setStep('qris');
    } catch (e) {
      setError('Terjadi kesalahan. Coba lagi.');
      resetTurnstile();
    }
    setLoading(false);
  }

  function formatCountdown(secs) {
    if (secs === null) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  const priceFormatted = product ? 'Rp' + product.price.toLocaleString('id-ID') : '';

  if (!product) return null;

  return (
    <Modal show={show} onClose={onClose} maxWidth={500}>
      <div style={{ padding: '1.25rem 1.25rem .75rem', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'white', borderRadius: '1.5rem 1.5rem 0 0', zIndex: 10 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1f2937' }}>🛒 Checkout</h2>
        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fas fa-times" style={{ color: '#6b7280' }}></i>
        </button>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ background: '#f0fdf4', borderRadius: '.75rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: '.5rem', background: '#bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="fas fa-shopping-cart" style={{ color: '#15803d' }}></i>
          </div>
          <div>
            <p style={{ fontSize: '.875rem', color: '#166534', fontWeight: 600 }}>{product.name}</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 900, color: '#14532d' }}>{priceFormatted}</p>
          </div>
        </div>

        <div style={{ background: '#eff6ff', borderRadius: '.75rem', padding: '1rem', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
            <i className="fas fa-qrcode" style={{ color: '#2563eb' }}></i>
            <span style={{ fontWeight: 700, color: '#1e40af' }}>Metode: QRIS</span>
          </div>
          <p style={{ fontSize: '.75rem', color: '#3b82f6' }}>Scan kode QRIS setelah menekan tombol di bawah. Pembayaran berlaku <strong>15 menit</strong>.</p>
        </div>

        {step === 'form' && (
          <>
            <div>
              <p style={{ fontSize: '.75rem', color: '#6b7280', marginBottom: '.5rem' }}>Selesaikan verifikasi untuk melanjutkan:</p>
              <div ref={turnstileRef} className="cf-turnstile"></div>
            </div>
            {error && <p style={{ color: '#dc2626', fontSize: '.875rem', textAlign: 'center' }}>{error}</p>}
            <button
              className="btn-primary"
              style={{ width: '100%', padding: '.875rem', fontSize: '1rem', opacity: turnstileReady && !loading ? 1 : 0.6 }}
              onClick={handleProcess}
              disabled={!turnstileReady || loading}
            >
              {loading ? <><i className="fas fa-spinner fa-spin"></i> Memproses...</> : <><i className="fas fa-qrcode"></i> Proses QRIS</>}
            </button>
          </>
        )}

        {step === 'qris' && (
          <>
            {orderStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <i className="fas fa-check-circle animate-checkmark" style={{ fontSize: '3rem', color: '#22c55e', marginBottom: '1rem', display: 'block' }}></i>
                <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#15803d' }}>Pembayaran Berhasil!</p>
                <p style={{ color: '#4b7c4b', fontSize: '.875rem', marginTop: '.5rem' }}>Terima kasih sudah membeli {product.name} 🙏</p>
                {product.fileUrl && (
                  <a
                    href={product.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-download"
                    style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center' }}
                  >
                    <i className="fas fa-download"></i> Download Produk
                  </a>
                )}
              </div>
            ) : (
              <>
                <div style={{ border: '2px dashed #22c55e', borderRadius: '.75rem', padding: '1.5rem', textAlign: 'center', background: '#f0fdf4' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '.75rem' }}>Scan QRIS</h3>
                  {qrisData?.qr_url ? (
                    <img
                      src={qrisData.qr_url}
                      alt="QRIS"
                      style={{ width: 176, height: 176, margin: '0 auto', borderRadius: '.5rem' }}
                      onContextMenu={e => e.preventDefault()}
                      draggable={false}
                    />
                  ) : (
                    <svg viewBox="0 0 200 200" fill="none" style={{ width: 176, height: 176, margin: '0 auto' }}>
                      <rect x="20" y="20" width="160" height="160" rx="16" fill="white" stroke="#29b77d" strokeWidth="3"/>
                      <rect x="35" y="35" width="45" height="45" rx="8" fill="#29b77d"/>
                      <rect x="120" y="35" width="45" height="45" rx="8" fill="#29b77d"/>
                      <rect x="35" y="120" width="45" height="45" rx="8" fill="#29b77d"/>
                      <circle cx="100" cy="100" r="14" fill="#29b77d" opacity=".8"/>
                      <circle cx="100" cy="100" r="6" fill="white"/>
                    </svg>
                  )}
                  <p style={{ fontSize: '.875rem', color: '#15803d', fontWeight: 600, marginTop: '.75rem' }}>Kreatif Digital - QRIS</p>
                  <p style={{ fontSize: '.75rem', color: '#6b7280' }}>Scan dengan e-wallet / mobile banking</p>
                </div>

                {qrisData?.order_id && (
                  <div style={{ background: '#f9fafb', borderRadius: '.75rem', padding: '.75rem 1rem', fontSize: '.8rem', color: '#374151' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>Order ID</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{qrisData.order_id}</span>
                    </div>
                  </div>
                )}

                <div style={{ background: '#fffbeb', borderRadius: '.75rem', padding: '1rem', textAlign: 'center', border: '1px solid #fde68a' }}>
                  <p style={{ fontSize: '.75rem', color: '#b45309', marginBottom: '.25rem' }}>
                    <i className="fas fa-hourglass-half" style={{ marginRight: '.25rem' }}></i> Sisa waktu pembayaran:
                  </p>
                  <p className={`qris-countdown ${countdown !== null && countdown < 60 ? 'countdown-warning' : ''}`} style={{ color: '#b45309' }}>
                    {formatCountdown(countdown)}
                  </p>
                </div>

                <p style={{ fontSize: '.75rem', color: '#3b82f6', background: '#eff6ff', padding: '.75rem', borderRadius: '.75rem' }}>
                  <i className="fas fa-info-circle" style={{ marginRight: '.25rem' }}></i>
                  Menunggu konfirmasi pembayaran... Status akan berubah otomatis setelah transfer berhasil.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
