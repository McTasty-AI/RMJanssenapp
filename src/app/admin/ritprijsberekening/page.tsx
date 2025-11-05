
"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, useFieldArray, Controller, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from '@/components/ui/form';
import { PlusCircle, Trash2, Truck, Loader2, Route, Clock, Euro } from 'lucide-react';
import { cn } from '@/lib/utils';
import GooglePlacesAutocomplete from '@/components/GooglePlacesAutocomplete';
import { supabase } from '@/lib/supabase/client';
import type { Vehicle, CostCalculationData } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateDistance, type CalculateDistanceOutput } from '@/ai/flows/calculate-distance-flow';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader } from '@googlemaps/js-api-loader';

declare global {
  interface Window { google: any }
}
declare const google: any;
const MapDisplay = ({ encodedPolyline }: { encodedPolyline: string }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = React.useState<any>(null);
    const [decodedPath, setDecodedPath] = useState<any[]>([]);

    useEffect(() => {
        if (encodedPolyline && window.google && window.google.maps && window.google.maps.geometry) {
            const decoded = google.maps.geometry.polycase.decode(encodedPolyline);
            setDecodedPath(decoded.map((p: any) => ({ lat: p.lat(), lng: p.lng() })));
        }
    }, [encodedPolyline]);

    useEffect(() => {
        const loader = new Loader({
            apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
            version: "weekly",
            libraries: ["places", "geometry"],
        });

        loader.load().then(() => {
            if (mapRef.current && !map) {
                const newMap = new google.maps.Map(mapRef.current, {
                    center: { lat: 52.3676, lng: 4.9041 }, // Default to Amsterdam
                    zoom: 7,
                });
                setMap(newMap);
            }
        });
    }, [map]);

    useEffect(() => {
        if (map && decodedPath.length > 0) {
            const polyline = new google.maps.Polyline({
                path: decodedPath,
                geodesic: true,
                strokeColor: '#3498db',
                strokeOpacity: 1.0,
                strokeWeight: 4,
            });
            polyline.setMap(map);

            const bounds = new google.maps.LatLngBounds();
            decodedPath.forEach(point => bounds.extend(point));
            map.fitBounds(bounds);
        }
    }, [map, decodedPath]);

    return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} className="rounded-lg" />;
};


const stopSchema = z.object({
  address: z.string().min(3, "Adres is verplicht"),
});

const tripPriceSchema = z.object({
  stops: z.array(stopSchema).min(2, "Er zijn minimaal 2 adressen nodig."),
});

type TripPriceFormData = z.infer<typeof tripPriceSchema>;

const formatDistance = (meters: number) => {
    return `${(meters / 1000).toFixed(1)} km`;
}

const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}u ${minutes}m`;
}

const formatCurrency = (value?: number) => {
    if (value === undefined || isNaN(value)) return '-';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};


function RitprijsberekeningPageContent() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState<CalculateDistanceOutput | null>(null);
  const [isReturnTrip, setIsReturnTrip] = useState(false);
  const [returnPercentage, setReturnPercentage] = useState(100);
  const { toast } = useToast();

  const form = useForm<TripPriceFormData>({
    resolver: zodResolver(tripPriceSchema),
    defaultValues: {
      stops: [{ address: '' }, { address: '' }],
    },
  });

  const { control, handleSubmit, formState: { errors } } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "stops",
  });
  
  useEffect(() => {
    let active = true;
    const fetchVehicles = async () => {
      const { data, error } = await supabase.from('vehicles').select('*');
      if (!active) return;
      if (error) { console.error('Error fetching vehicles:', error); setLoadingVehicles(false); return; }
      const activeVehicles = ((data || []).map(row => ({ ...(row as any), id: row.id })) as any as Vehicle[])
        .filter(v => (v.status === 'Actief' || v.status === 'active') && (v as any).costCalculation);
      setVehicles(activeVehicles);
      setLoadingVehicles(false);
    };
    fetchVehicles();
    const ch = supabase.channel('tripprice-vehicles').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetchVehicles).subscribe();
    return () => { active = false; ch.unsubscribe(); };
  }, []);
  

  const onSubmit = async (data: TripPriceFormData) => {
    if (!selectedVehicle) {
      toast({
        variant: 'destructive',
        title: 'Geen voertuig geselecteerd',
        description: 'Selecteer een voertuig met een kostprijsberekening om de ritprijs te berekenen.'
      });
      return;
    }
    
    setIsCalculating(true);
    setCalculationResult(null);

    const result = await calculateDistance({ stops: data.stops.map(s => s.address).filter(s => s.trim() !== '') });

    if (result.error) {
        toast({
            variant: 'destructive',
            title: 'Routeberekening mislukt',
            description: result.error,
            duration: 7000
        });
    } else {
        setCalculationResult(result);
        toast({ title: "Route berekend", description: "Afstand en duur zijn succesvol opgehaald." });
    }

    setIsCalculating(false);
  };
  
   const tripPrice = useMemo(() => {
        if (!calculationResult || !selectedVehicle?.costCalculation || calculationResult.error) return null;

        const costCalc = selectedVehicle.costCalculation as any;
        const productiveHours = costCalc.productiveHoursYear || 1;

        if (productiveHours === 1) {
            console.warn("Productive hours is 1, check cost calculation data.");
        }
        
        const kmRate = costCalc.variableCosts?.totalPerKm ?? 0;
        const totalYearlyCostsWithoutVariable = (costCalc.fixedCosts?.total ?? 0) + (costCalc.totalPersonnelCosts ?? 0) + (costCalc.generalCosts?.perVehicle ?? 0);
        const hourRate = totalYearlyCostsWithoutVariable / productiveHours;
        
        const distanceKm = calculationResult.totalDistanceMeters! / 1000;
        const durationHours = calculationResult.totalDurationSeconds! / 3600;

        const oneWayDistanceCost = distanceKm * kmRate;
        const oneWayTimeCost = durationHours * hourRate;
        const oneWayTotal = oneWayDistanceCost + oneWayTimeCost;

        if (isReturnTrip) {
            const returnCost = oneWayTotal * (returnPercentage / 100);
            const total = oneWayTotal + returnCost;
            return {
                oneWay: oneWayTotal,
                return: returnCost,
                total: total
            };
        }

        return {
            oneWay: oneWayTotal,
            total: oneWayTotal,
            return: 0,
        };
    }, [calculationResult, selectedVehicle, isReturnTrip, returnPercentage]);

  return (
    <div className="space-y-8">
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Ritprijsberekening</h1>
                    <p className="text-muted-foreground">Bereken de ritprijs per voertuig op basis van de kostprijsberekening.</p>
                </div>
            </div>
            <p className="text-muted-foreground">Voer de adressen van de rit in om de afstand en prijs te berekenen.</p>
        </div>
        
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="space-y-6">
                <Card>
                <CardHeader>
                    <CardTitle>Voertuig & Kostprijs</CardTitle>
                    <CardDescription>
                        Selecteer het voertuig waarvoor u de ritprijs wilt berekenen. De bijbehorende kostprijsberekening wordt gebruikt als basis.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingVehicles ? (
                        <Skeleton className="h-10 w-full" />
                    ) : (
                        <Select onValueChange={(id) => setSelectedVehicle(vehicles.find(v => v.id === id) || null)} disabled={vehicles.length === 0}>
                            <SelectTrigger>
                                <Truck className="mr-2 h-4 w-4 text-muted-foreground" />
                                <SelectValue placeholder="Kies een voertuig met kostprijsberekening..." />
                            </SelectTrigger>
                            <SelectContent>
                                {vehicles.length > 0 ? (
                                    vehicles.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.licensePlate} ({v.make} {v.model})</SelectItem>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-sm text-muted-foreground">
                                        Geen actieve voertuigen met een opgeslagen kostprijsberekening gevonden.
                                    </div>
                                )}
                            </SelectContent>
                        </Select>
                    )}
                </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                    <CardTitle>Route</CardTitle>
                    <CardDescription>
                        Voer de laad- en losadressen in. Voeg extra stops toe indien nodig.
                    </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <div className="space-y-2">
                                    {fields.map((field, index) => (
                                    <div key={field.id} className="flex items-start gap-4">
                                        <div className="flex flex-col items-center self-stretch pt-2">
                                            <span className={cn(
                                                "flex items-center justify-center w-8 h-8 rounded-full font-bold text-white",
                                                index === 0 && "bg-green-600",
                                                index === fields.length - 1 && "bg-red-600",
                                                index > 0 && index < fields.length - 1 && "bg-primary"
                                            )}>
                                            {String.fromCharCode(65 + index)}
                                            </span>
                                            {index < fields.length - 1 && (
                                                <div className="h-full w-px bg-border my-1" />
                                            )}
                                        </div>
                                        <div className="flex-grow">
                                            <Controller
                                                control={control}
                                                name={`stops.${index}.address`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                    <FormControl>
                                                        <GooglePlacesAutocomplete
                                                            {...field}
                                                            placeholder={`Adres ${String.fromCharCode(65 + index)}`}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 2}>
                                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </div>
                                    ))}
                                </div>
                                {errors.stops && !errors.stops.root && fields.length < 2 && (
                                    <p className="text-sm font-medium text-destructive">
                                    {errors.stops.message}
                                    </p>
                                )}
                                {errors.stops?.root && (
                                    <p className="text-sm font-medium text-destructive">
                                        {errors.stops.root.message}
                                    </p>
                                )}
                                <div className="flex flex-col sm:flex-row gap-4 pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => append({ address: '' })}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Stop Toevoegen
                                    </Button>
                                    <Button type="submit" disabled={isCalculating}>
                                        {isCalculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Bereken Route
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>

                {calculationResult && !calculationResult.error && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Resultaat Berekening</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                                    <Route className="h-8 w-8 text-primary" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">Totale Afstand</p>
                                        <p className="text-2xl font-bold">{formatDistance(calculationResult.totalDistanceMeters!)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                                    <Clock className="h-8 w-8 text-primary" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">Geschatte Reistijd</p>
                                        <p className="text-2xl font-bold">{formatDuration(calculationResult.totalDurationSeconds!)}</p>
                                    </div>
                                </div>
                                {tripPrice && (
                                    <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-lg col-span-1 md:col-span-2">
                                        <Euro className="h-8 w-8 text-primary" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Berekende Kostprijs</p>
                                            <p className="text-2xl font-bold text-primary">{formatCurrency(tripPrice.total)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border p-4 rounded-lg">
                                <div className="flex items-center space-x-2">
                                    <Switch id="return-trip" checked={isReturnTrip} onCheckedChange={setIsReturnTrip} />
                                    <Label htmlFor="return-trip">Retourrit meenemen</Label>
                                </div>
                                {isReturnTrip && (
                                    <div className="flex-grow flex items-center gap-4 w-full sm:w-auto">
                                        <Slider
                                            value={[returnPercentage]}
                                            onValueChange={(value) => setReturnPercentage(value[0])}
                                            max={100}
                                            step={5}
                                            className="w-full sm:max-w-xs"
                                        />
                                        <span className="font-bold w-12 text-right">{returnPercentage}%</span>
                                    </div>
                                )}
                            </div>

                            {tripPrice && (
                                <div className="text-sm text-muted-foreground space-y-1">
                                    <p>Enkele reis kosten: {formatCurrency(tripPrice.oneWay)}</p>
                                    {isReturnTrip && <p>Retourkosten ({returnPercentage}%): {formatCurrency(tripPrice.return)}</p>}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
             <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Route op Kaart</CardTitle>
                        <CardDescription>Visuele weergave van de berekende route.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {calculationResult?.encodedPolyline ? (
                            <MapDisplay encodedPolyline={calculationResult.encodedPolyline} />
                        ) : (
                            <div className="h-[400px] bg-muted rounded-lg flex items-center justify-center">
                                <p className="text-muted-foreground">Voer een route in om de kaart te tonen.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}

export default function RitprijsberekeningPage() {
    const methods = useForm<TripPriceFormData>();
    return (
        <FormProvider {...methods}>
            <RitprijsberekeningPageContent />
        </FormProvider>
    )
}
