'use client';

import { useEffect, useState, useRef } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, documentId, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { User } from 'firebase/auth';

/** Cache TTL: 15 minutes in milliseconds */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Cleanup interval: 5 minutes in milliseconds */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
/** Max scanned tickets limit for real-time stream */
const SCANNED_TICKETS_LIMIT = 300;

export const PLACEHOLDER_GUEST_NAME = 'زائر';
export const PLACEHOLDER_UNKNOWN_CHURCH = 'غير محدد';
export const PLACEHOLDER_UNNAMED_ATTENDEE = 'حاضر بدون اسم';
export const PLACEHOLDER_UNKNOWN_TIME = 'غير محدد';

interface CachedRegistrantInfo {
  fullName: string;
  church: string;
  phoneNumber: string;
  fetchedAt: number;
}

export interface RawTicketData {
  id: string;
  registrantId?: string;
  registrantName?: string;
  church?: string;
  phoneNumber?: string;
  used?: boolean;
  usedAt?: Timestamp | null;
  usedByUsherId?: string;
}

export interface ScannedTicketItem {
  id: string;
  registrantId?: string;
  registrantName?: string;
  church?: string;
  phoneNumber?: string;
  usedAt?: Timestamp | null;
  usedByUsherId?: string;
}

/**
 * Batched resolver that hydrates scanned tickets with registrant details.
 * Replaces N+1 per-ticket getDoc calls with batched 'in' queries (chunks of 10)
 * while maintaining 15-minute TTL cache and negative caching semantics.
 */
async function resolveScannedTickets(
  rawTickets: RawTicketData[],
  cacheMap: Map<string, CachedRegistrantInfo>
): Promise<ScannedTicketItem[]> {
  const now = Date.now();

  // 1. Collect unique registrantIds that need fetching from Firestore
  const missingIdsSet = new Set<string>();

  for (const data of rawTickets) {
    const regId = data.registrantId;
    let name = data.registrantName;
    let ch = data.church;
    let phone = data.phoneNumber || '';

    const isMissingData =
      !name ||
      name === PLACEHOLDER_GUEST_NAME ||
      !ch ||
      ch === PLACEHOLDER_UNKNOWN_CHURCH ||
      !phone;

    if (isMissingData && regId) {
      const cached = cacheMap.get(regId);
      const isExpired = cached && now - cached.fetchedAt > CACHE_TTL_MS;

      if (!cached || isExpired) {
        if (isExpired) {
          cacheMap.delete(regId);
        }
        missingIdsSet.add(regId);
      }
    }
  }

  // 2. Batch fetch missing IDs in chunks of 10 using documentId() 'in' query
  const idsToFetch = Array.from(missingIdsSet);
  const CHUNK_SIZE = 10;

  for (let i = 0; i < idsToFetch.length; i += CHUNK_SIZE) {
    const chunk = idsToFetch.slice(i, i + CHUNK_SIZE);
    try {
      const q = query(
        collection(db, 'registrants'),
        where(documentId(), 'in', chunk)
      );
      const snap = await getDocs(q);

      const foundIds = new Set<string>();
      snap.forEach((docSnap) => {
        foundIds.add(docSnap.id);
        const r = docSnap.data();
        cacheMap.set(docSnap.id, {
          fullName: r.fullName || '',
          church: r.church || '',
          phoneNumber: r.phoneNumber || '',
          fetchedAt: now,
        });
      });

      // Negative caching for any registrant IDs not found in Firestore
      chunk.forEach((id) => {
        if (!foundIds.has(id)) {
          cacheMap.set(id, {
            fullName: '',
            church: '',
            phoneNumber: '',
            fetchedAt: now,
          });
        }
      });
    } catch (err) {
      console.error('Error batch-fetching registrants chunk:', err);
    }
  }

  // 3. Hydrate rawTickets from ticket fields + cache
  return rawTickets.map((data) => {
    const regId = data.registrantId;
    let name = data.registrantName;
    let ch = data.church;
    let phone = data.phoneNumber || '';

    if (regId) {
      const cached = cacheMap.get(regId);
      if (cached) {
        if (cached.fullName) name = cached.fullName;
        if (cached.church) ch = cached.church;
        if (cached.phoneNumber) phone = cached.phoneNumber;
      }
    }

    return {
      id: data.id,
      registrantId: regId || data.id,
      registrantName: name || PLACEHOLDER_UNNAMED_ATTENDEE,
      church: ch || PLACEHOLDER_UNKNOWN_CHURCH,
      phoneNumber: phone,
      usedAt: data.usedAt,
      usedByUsherId: data.usedByUsherId || 'الماسح الإلكتروني',
    };
  });
}

/**
 * Custom hook managing real-time scanned ticket subscription, TTL cache,
 * batching, and race-condition guards.
 */
export function useScannedTickets(user: User | null) {
  const [tickets, setTickets] = useState<ScannedTicketItem[]>([]);
  const [loading, setLoading] = useState(true);

  // TTL Cache for registrant details by registrantId to prevent N+1 Firestore reads
  const registrantsCacheRef = useRef<Map<string, CachedRegistrantInfo>>(new Map());
  // Version counter to prevent out-of-order state updates during fast snapshot emissions
  const snapshotVersionRef = useRef<number>(0);

  // Automatic periodic garbage collector to sweep expired entries every 5 minutes and clear on unmount
  useEffect(() => {
    const sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of registrantsCacheRef.current.entries()) {
        if (now - entry.fetchedAt > CACHE_TTL_MS) {
          registrantsCacheRef.current.delete(key);
        }
      }
    }, CLEANUP_INTERVAL_MS);

    return () => {
      clearInterval(sweeper);
      registrantsCacheRef.current.clear();
    };
  }, []);

  // Real-time listener for scanned tickets
  useEffect(() => {
    if (!user) return;

    const qScanned = query(
      collection(db, 'tickets'),
      where('used', '==', true),
      orderBy('usedAt', 'desc'),
      limit(SCANNED_TICKETS_LIMIT)
    );

    const unsubscribeScanned = onSnapshot(
      qScanned,
      async (snapshot) => {
        // Track snapshot version to guard against race conditions
        const currentVersion = ++snapshotVersionRef.current;

        const rawTickets: RawTicketData[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<RawTicketData, 'id'>),
        }));

        // Resolve detailed registrant info using batched 'in' queries & TTL cache
        const resolvedItems = await resolveScannedTickets(
          rawTickets,
          registrantsCacheRef.current
        );

        // Discard out-of-order snapshot resolution if a newer snapshot was triggered in the meantime
        if (currentVersion !== snapshotVersionRef.current) {
          return;
        }

        setTickets(resolvedItems);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching scanned tickets:', err);
        setLoading(false);
      }
    );

    return () => unsubscribeScanned();
  }, [user]);

  return { tickets, loading };
}
