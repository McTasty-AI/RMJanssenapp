
'use server';

/**
 * @fileOverview An AI flow to calculate the distance and duration for a trip.
 *
 * - calculateDistance - A function that handles the distance calculation.
 * - CalculateDistanceInput - The input type for the calculateDistance function.
 * - CalculateDistanceOutput - The return type for the calculate-distance-flow function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';


const CalculateDistanceInputSchema = z.object({
  stops: z.array(z.string()).min(2, "At least two stops are required."),
  encodedPolyline: z.string().optional(),
});
export type CalculateDistanceInput = z.infer<typeof CalculateDistanceInputSchema>;

const CalculateDistanceOutputSchema = z.object({
  totalDistanceMeters: z.number().optional().describe("The total distance of the trip in meters."),
  totalDurationSeconds: z.number().optional().describe("The total duration of the trip in seconds."),
  encodedPolyline: z.string().optional().describe("The encoded polyline of the route."),
  error: z.string().optional().describe("An error message if the route could not be calculated."),
});
export type CalculateDistanceOutput = z.infer<typeof CalculateDistanceOutputSchema>;


const getDirections = ai.defineTool(
    {
        name: 'getDirections',
        description: 'Get the distance and duration for a route between an origin, a destination, and optional waypoints.',
        inputSchema: z.object({
            origin: z.string(),
            destination: z.string(),
            waypoints: z.array(z.string()).optional(),
        }),
        outputSchema: z.object({
            distanceMeters: z.number().optional(),
            durationSeconds: z.number().optional(),
            polyline: z.string().optional(),
            error: z.string().optional(),
        }),
    },
    async ({ origin, destination, waypoints }) => {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            return { error: "Google Maps API key is not configured." };
        }
        
        if (!origin || !destination) {
            return { error: "Origin and destination are required." };
        }
        
        const validWaypoints = waypoints?.filter(wp => wp && wp.trim() !== '') || [];

        const params = new URLSearchParams({
            origin,
            destination,
            key: apiKey,
            mode: 'driving'
        });

        if (validWaypoints.length > 0) {
            params.append('waypoints', validWaypoints.join('|'));
        }

        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
            const data = await response.json();

            if (data.status === 'ZERO_RESULTS') {
                return { error: "Google Maps kon geen route vinden tussen de opgegeven locaties. Controleer of de adressen correct en bereikbaar zijn met de auto." };
            }
             if (data.status === 'NOT_FOUND') {
                const invalidParam = data.error_message?.includes("origin") ? "startpunt" : "bestemming";
                 return { error: `Het opgegeven ${invalidParam} kon niet worden gevonden. Controleer het adres.` };
            }
            
            if (data.status !== 'OK') {
                console.error('Error response from Google Maps API:', JSON.stringify(data, null, 2));
                return { error: `Google Maps API error: ${data.status} - ${data.error_message || 'No additional error message provided.'}` };
            }

            const route = data.routes[0];
            if (!route) {
                return { error: 'No routes found in the API response. Please check if all addresses are valid.' };
            }
            
            const totalDistance = route.legs.reduce((sum: number, leg: any) => sum + (leg.distance?.value || 0), 0);
            const totalDuration = route.legs.reduce((sum: number, leg: any) => sum + (leg.duration?.value || 0), 0);
            
            return {
                distanceMeters: totalDistance,
                durationSeconds: totalDuration,
                polyline: route.overview_polyline?.points
            };

        } catch (error: any) {
            console.error('Fatal error fetching directions:', error.message);
            return { error: 'Could not fetch directions from Google Maps API due to a network or server error.' };
        }
    }
);


const calculateDistanceFlow = ai.defineFlow(
  {
    name: 'calculateDistanceFlow',
    inputSchema: CalculateDistanceInputSchema,
    outputSchema: CalculateDistanceOutputSchema,
  },
  async (input) => {
    const validStops = input.stops.map(s => s ? s.trim() : '').filter(s => s !== '');
    
    if (validStops.length < 2) {
      return { error: "Minstens twee geldige (niet-lege) adressen zijn vereist." };
    }
    
    const origin = validStops[0];
    const destination = validStops[validStops.length - 1];
    const waypoints = validStops.slice(1, -1);
    
    const result = await getDirections({
        origin,
        destination,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
    });

    if (result.error) {
        return { error: result.error };
    }
    
    if (result.distanceMeters === undefined || result.durationSeconds === undefined) {
         return { error: "The distance calculation did not return a valid result." };
    }

    return {
        totalDistanceMeters: result.distanceMeters,
        totalDurationSeconds: result.durationSeconds,
        encodedPolyline: result.polyline
    };
  }
);


export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  return calculateDistanceFlow(input);
}
