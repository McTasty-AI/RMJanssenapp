"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './use-auth';
import { mapSupabaseToApp } from '@/lib/utils';

// Cache voor collections om snellere initial load te krijgen
const collectionCache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minuten

export const useUserCollection = <T = any>(collectionName: string) => {
    const [documents, setDocuments] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const { user, isLoaded } = useAuth();
    const loadingRef = useRef(false);
    const fetchDataRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        if (!isLoaded) {
            return;
        }
        
        if (!user) {
            setDocuments([]);
            setLoading(false);
            return;
        }

        // Voorkom dubbele loads
        if (loadingRef.current) return;
        loadingRef.current = true;

        // Map Firestore collection names to Supabase table names
        const tableMap: Record<string, string> = {
            'declarations': 'declarations',
            'leaveRequests': 'leave_requests',
            'truckLogs': 'weekly_logs',
            'fines': 'fines',
        };

        const tableName = tableMap[collectionName] || collectionName.toLowerCase();
        const cacheKey = `${user.uid}-${tableName}`;

        // Check cache eerst voor snellere initial load
        const cached = collectionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setDocuments(cached.data);
            setLoading(false);
            loadingRef.current = false;
            // Load fresh data in background
            fetchDataInBackground();
            return;
        }

        // Initial fetch
        fetchData();

        async function fetchData() {
            setLoading(true);
            try {
                // For weekly_logs, we need to include daily_logs
                let query = supabase
                    .from(tableName)
                    .select(tableName === 'weekly_logs' ? '*, daily_logs (*)' : '*')
                    .eq('user_id', user.uid);

                const { data, error } = await query;

                if (error) {
                    console.error(`Error fetching user collection (${collectionName}):`, error);
                    setLoading(false);
                    loadingRef.current = false;
                    return;
                }

                // Transform weekly_logs with daily_logs to app format
                let mapped;
                if (tableName === 'weekly_logs' && data) {
                    mapped = data.map((doc: any) => {
                        const base = mapSupabaseToApp<T>(doc);
                        // Transform daily_logs array to days array
                        if (doc.daily_logs && Array.isArray(doc.daily_logs)) {
                            (base as any).days = doc.daily_logs.map((dl: any) => ({
                                date: dl.date,
                                day: dl.day_name,
                                status: dl.status,
                                startTime: dl.start_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                endTime: dl.end_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                breakTime: dl.break_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                startMileage: dl.start_mileage || 0,
                                endMileage: dl.end_mileage || 0,
                                toll: dl.toll || 'Geen',
                                licensePlate: dl.license_plate,
                                overnightStay: dl.overnight_stay || false,
                                tripNumber: dl.trip_number || '',
                            }));
                        } else {
                            (base as any).days = [];
                        }
                        return base;
                    });
                } else if (tableName === 'declarations' && data) {
                    // For declarations, generate signed URLs for receipts
                    mapped = await Promise.all(data.map(async (doc: any) => {
                        const base = mapSupabaseToApp<T>(doc);
                        let receiptUrl = '';
                        if (doc.receipt_path) {
                            try {
                                // Create signed URL that expires in 1 hour
                                const { data: signedData, error: signedError } = await supabase.storage
                                    .from('receipts')
                                    .createSignedUrl(doc.receipt_path, 3600);
                                if (!signedError && signedData) {
                                    receiptUrl = signedData.signedUrl;
                                }
                            } catch (err) {
                                console.error('Error generating signed URL for receipt:', err);
                            }
                        }
                        (base as any).receiptUrl = receiptUrl;
                        return base;
                    }));
                } else if (tableName === 'fines' && data) {
                    // For fines, generate signed URLs for receipts
                    mapped = await Promise.all(data.map(async (doc: any) => {
                        const base = mapSupabaseToApp<T>(doc);
                        let receiptUrl = '';
                        if (doc.receipt_path) {
                            try {
                                // Create signed URL that expires in 1 hour (fines bucket is private)
                                const { data: signedData, error: signedError } = await supabase.storage
                                    .from('fines')
                                    .createSignedUrl(doc.receipt_path, 3600);
                                if (!signedError && signedData) {
                                    receiptUrl = signedData.signedUrl;
                                }
                            } catch (err) {
                                console.error('Error generating signed URL for fine receipt:', err);
                            }
                        }
                        (base as any).receiptUrl = receiptUrl;
                        return base;
                    }));
                } else {
                    mapped = ((data || []).map((doc) => mapSupabaseToApp<T>(doc)));
                }
                
                setDocuments(mapped);
                collectionCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
                setLoading(false);
                loadingRef.current = false;
            } catch (error) {
                console.error(`Error fetching user collection (${collectionName}):`, error);
                setLoading(false);
                loadingRef.current = false;
            }
        }

        // Store fetchData function for manual refresh
        fetchDataRef.current = async () => {
            // Clear cache to force fresh fetch
            collectionCache.delete(cacheKey);
            loadingRef.current = false;
            await fetchData();
        };

        async function fetchDataInBackground() {
            try {
                let query = supabase
                    .from(tableName)
                    .select(tableName === 'weekly_logs' ? '*, daily_logs (*)' : '*')
                    .eq('user_id', user.uid);

                const { data, error } = await query;

                if (!error && data) {
                    let mapped;
                    if (tableName === 'weekly_logs') {
                        mapped = data.map((doc: any) => {
                            const base = mapSupabaseToApp<T>(doc);
                            if (doc.daily_logs && Array.isArray(doc.daily_logs)) {
                                (base as any).days = doc.daily_logs.map((dl: any) => ({
                                    date: dl.date,
                                    day: dl.day_name,
                                    status: dl.status,
                                    startTime: dl.start_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                    endTime: dl.end_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                    breakTime: dl.break_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                    startMileage: dl.start_mileage || 0,
                                    endMileage: dl.end_mileage || 0,
                                    toll: dl.toll || 'Geen',
                                    licensePlate: dl.license_plate,
                                    overnightStay: dl.overnight_stay || false,
                                    tripNumber: dl.trip_number || '',
                                }));
                            } else {
                                (base as any).days = [];
                            }
                            return base;
                        });
                    } else if (tableName === 'declarations') {
                        // For declarations, generate signed URLs for receipts
                        mapped = await Promise.all(data.map(async (doc: any) => {
                            const base = mapSupabaseToApp<T>(doc);
                            let receiptUrl = '';
                            if (doc.receipt_path) {
                                try {
                                    const { data: signedData, error: signedError } = await supabase.storage
                                        .from('receipts')
                                        .createSignedUrl(doc.receipt_path, 3600);
                                    if (!signedError && signedData) {
                                        receiptUrl = signedData.signedUrl;
                                    }
                                } catch (err) {
                                    console.debug('Error generating signed URL for receipt:', err);
                                }
                            }
                            (base as any).receiptUrl = receiptUrl;
                            return base;
                        }));
                    } else if (tableName === 'fines') {
                        // For fines, generate signed URLs for receipts
                        mapped = await Promise.all(data.map(async (doc: any) => {
                            const base = mapSupabaseToApp<T>(doc);
                            let receiptUrl = '';
                            if (doc.receipt_path) {
                                try {
                                    const { data: signedData, error: signedError } = await supabase.storage
                                        .from('fines')
                                        .createSignedUrl(doc.receipt_path, 3600);
                                    if (!signedError && signedData) {
                                        receiptUrl = signedData.signedUrl;
                                    }
                                } catch (err) {
                                    console.debug('Error generating signed URL for fine receipt:', err);
                                }
                            }
                            (base as any).receiptUrl = receiptUrl;
                            return base;
                        }));
                    } else {
                        mapped = ((data || []).map((doc) => mapSupabaseToApp<T>(doc)));
                    }
                    setDocuments(mapped);
                    collectionCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
                }
            } catch (error) {
                console.debug(`Background refresh failed for ${collectionName}:`, error);
            }
        }
        
        // Subscribe to changes
        const channel = supabase
            .channel(`${tableName}-changes-${user.uid}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: tableName,
                    filter: `user_id=eq.${user.uid}`,
                },
                async () => {
                    // Clear cache bij changes
                    collectionCache.delete(cacheKey);
                    // Refetch on any change
                    let query = supabase
                        .from(tableName)
                        .select(tableName === 'weekly_logs' ? '*, daily_logs (*)' : '*')
                        .eq('user_id', user.uid);

                    const { data, error } = await query;

                    if (error) {
                        console.error(`Error fetching user collection (${collectionName}):`, error);
                        return;
                    }

                    let mapped;
                    if (tableName === 'weekly_logs' && data) {
                        mapped = data.map((doc: any) => {
                            const base = mapSupabaseToApp<T>(doc);
                            if (doc.daily_logs && Array.isArray(doc.daily_logs)) {
                                (base as any).days = doc.daily_logs.map((dl: any) => ({
                                    date: dl.date,
                                    day: dl.day_name,
                                    status: dl.status,
                                    startTime: dl.start_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                    endTime: dl.end_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                    breakTime: dl.break_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                                    startMileage: dl.start_mileage || 0,
                                    endMileage: dl.end_mileage || 0,
                                    toll: dl.toll || 'Geen',
                                    licensePlate: dl.license_plate,
                                    overnightStay: dl.overnight_stay || false,
                                    tripNumber: dl.trip_number || '',
                                }));
                            } else {
                                (base as any).days = [];
                            }
                            return base;
                        });
                    } else if (tableName === 'declarations' && data) {
                        // For declarations, generate signed URLs for receipts
                        mapped = await Promise.all(data.map(async (doc: any) => {
                            const base = mapSupabaseToApp<T>(doc);
                            let receiptUrl = '';
                            if (doc.receipt_path) {
                                try {
                                    const { data: signedData, error: signedError } = await supabase.storage
                                        .from('receipts')
                                        .createSignedUrl(doc.receipt_path, 3600);
                                    if (!signedError && signedData) {
                                        receiptUrl = signedData.signedUrl;
                                    }
                                } catch (err) {
                                    console.debug('Error generating signed URL for receipt:', err);
                                }
                            }
                            (base as any).receiptUrl = receiptUrl;
                            return base;
                        }));
                    } else if (tableName === 'fines' && data) {
                        // For fines, generate signed URLs for receipts
                        mapped = await Promise.all(data.map(async (doc: any) => {
                            const base = mapSupabaseToApp<T>(doc);
                            let receiptUrl = '';
                            if (doc.receipt_path) {
                                try {
                                    const { data: signedData, error: signedError } = await supabase.storage
                                        .from('fines')
                                        .createSignedUrl(doc.receipt_path, 3600);
                                    if (!signedError && signedData) {
                                        receiptUrl = signedData.signedUrl;
                                    }
                                } catch (err) {
                                    console.debug('Error generating signed URL for fine receipt:', err);
                                }
                            }
                            (base as any).receiptUrl = receiptUrl;
                            return base;
                        }));
                    } else {
                        mapped = ((data || []).map((doc) => mapSupabaseToApp<T>(doc)));
                    }
                    setDocuments(mapped);
                    collectionCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
                }
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
            loadingRef.current = false;
        };
    }, [user, isLoaded, collectionName]);

    // Expose refresh function
    const refresh = useCallback(async () => {
        if (fetchDataRef.current) {
            await fetchDataRef.current();
        }
    }, []);

    return { documents, loading, refresh };
};
