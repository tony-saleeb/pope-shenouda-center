'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection, query, orderBy, limit, getDocs,
  startAfter, where, QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Registrant, RegistrantStatus } from '@/lib/types';

interface RegistrantItem {
  id: string;
  data: Registrant;
}

const STATUS_LABELS: Record<RegistrantStatus, { label: string; className: string }> = {
  pending_verification: { label: 'قيد التحقق', className: 'badge-pending' },
  auto_approved: { label: 'موافقة تلقائية', className: 'badge-approved' },
  manual_review: { label: 'تحتاج مراجعة', className: 'badge-review' },
  approved: { label: 'موافق عليه', className: 'badge-approved' },
  rejected: { label: 'مرفوض', className: 'badge-rejected' },
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'جميع الحالات' },
  { value: 'pending_verification', label: 'قيد التحقق' },
  { value: 'manual_review', label: 'تحتاج مراجعة' },
  { value: 'auto_approved', label: 'موافقة تلقائية' },
  { value: 'approved', label: 'موافق عليه' },
  { value: 'rejected', label: 'مرفوض' },
];

export default function RegistrantsPage() {
  const [items, setItems] = useState<RegistrantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 25;

  const fetchItems = useCallback(async (after?: QueryDocumentSnapshot) => {
    try {
      const constraints = [];
      if (statusFilter) {
        constraints.push(where('status', '==', statusFilter));
      }
      constraints.push(orderBy('createdAt', 'desc'));
      constraints.push(limit(PAGE_SIZE));

      if (after) {
        constraints.push(startAfter(after));
      }

      const q = query(collection(db, 'registrants'), ...constraints);
      const snapshot = await getDocs(q);

      const newItems = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as Registrant,
      }));

      if (after) {
        setItems((prev) => [...prev, ...newItems]);
      } else {
        setItems(newItems);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching registrants:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    setLastDoc(null);
    fetchItems();
  }, [statusFilter, fetchItems]);

  const filteredItems = searchTerm
    ? items.filter(
        (item) =>
          item.data.fullName.includes(searchTerm) ||
          item.data.phoneNumber.includes(searchTerm) ||
          item.data.church.includes(searchTerm)
      )
    : items;

  return (
    <div>
      {/* Title Bar */}
      <div style={{
        marginBottom: '2.5rem',
        borderBottom: '1px solid rgba(242, 158, 19, 0.12)',
        paddingBottom: '1.25rem',
      }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.25rem' }}>
          قائمة المسجّلين في المؤتمر
        </h1>
        <p style={{ color: 'rgba(247, 240, 228, 0.55)', fontSize: '0.875rem' }}>
          بحث وسجل كامل لجميع بيانات المسجلين وتصفية الحالات
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        gap: '0.875rem',
        marginBottom: '1.75rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Search Field with Icon */}
        <div style={{ position: 'relative', flex: '1 1 18rem' }}>
          <div style={{
            position: 'absolute',
            right: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#fbba33',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            type="text"
            className="form-input"
            placeholder="بحث بالاسم أو رقم الهاتف أو الكنيسة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              paddingRight: '2.75rem',
              background: 'rgba(19, 12, 5, 0.65)',
              borderColor: 'rgba(242, 158, 19, 0.25)',
              color: '#f7f0e4',
            }}
          />
        </div>

        {/* Status Dropdown */}
        <select
          className="form-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            flex: '0 0 auto',
            minWidth: '12rem',
            cursor: 'pointer',
            background: 'rgba(19, 12, 5, 0.65)',
            borderColor: 'rgba(242, 158, 19, 0.25)',
            color: '#f7f0e4',
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ background: '#1f1306', color: '#f7f0e4' }}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table Section */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 1.5rem', borderTopColor: '#fbba33' }} />
          <p style={{ color: 'rgba(247, 240, 228, 0.65)', fontSize: '0.9375rem' }}>جاري تحميل البيانات...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', maxWidth: '32rem', margin: '2rem auto' }}>
          <div style={{
            width: '4.5rem',
            height: '4.5rem',
            borderRadius: '50%',
            background: 'rgba(242, 158, 19, 0.12)',
            border: '1px solid rgba(242, 158, 19, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem' }}>
            لا توجد نتائج مطابقة
          </h2>
          <p style={{ color: 'rgba(247, 240, 228, 0.5)', fontSize: '0.875rem' }}>
            جرب البحث باستخدام كلمات أو أرقام أخرى أو تغيير فلتر التصفية.
          </p>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden', padding: 0, border: '1px solid rgba(242, 158, 19, 0.2)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(12, 7, 3, 0.7)', borderBottom: '1px solid rgba(242, 158, 19, 0.18)' }}>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>الاسم الكامل</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>الكنيسة</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>رقم الموبايل</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>حالة الطلب</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>مرجع الإيصال</th>
                  <th style={{ color: '#fbba33', padding: '1rem 1.25rem', textAlign: 'right', fontWeight: 700 }}>تاريخ التسجيل</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const statusInfo = STATUS_LABELS[item.data.status];
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid rgba(242, 158, 19, 0.08)',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <td style={{ fontWeight: 700, color: '#f7f0e4', padding: '1rem 1.25rem' }}>{item.data.fullName}</td>
                      <td style={{ color: 'rgba(247, 240, 228, 0.8)', padding: '1rem 1.25rem' }}>{item.data.church}</td>
                      <td dir="ltr" style={{ textAlign: 'right', color: 'rgba(247, 240, 228, 0.85)', padding: '1rem 1.25rem', fontFamily: 'monospace' }}>
                        {item.data.phoneNumber}
                      </td>
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <span className={`badge ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.875rem', color: '#fbba33', padding: '1rem 1.25rem', fontFamily: 'monospace' }}>
                        {item.data.ocrExtractedReference || '—'}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'rgba(247, 240, 228, 0.55)', padding: '1rem 1.25rem' }}>
                        {item.data.createdAt?.toDate?.()
                          ? new Date(item.data.createdAt.toDate()).toLocaleDateString('ar-EG')
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div style={{ padding: '1.25rem', textAlign: 'center', background: 'rgba(12, 7, 3, 0.4)', borderTop: '1px solid rgba(242, 158, 19, 0.12)' }}>
              <button
                className="btn btn-ghost"
                onClick={() => lastDoc && fetchItems(lastDoc)}
                style={{ padding: '0.625rem 1.75rem', fontSize: '0.875rem', color: '#fbba33', border: '1px solid rgba(242, 158, 19, 0.25)' }}
              >
                تحميل المزيد من المسجلين
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
