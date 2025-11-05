
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DamageReportPage() {

    return (
        <div className="w-full max-w-[90%] mx-auto p-4 md:p-8 space-y-8">
             <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Schade Melden</h1>
                    <p className="text-muted-foreground">Meld hier eventuele schade aan uw voertuig.</p>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Schadeformulier</CardTitle>
                    <CardDescription>
                        Deze functionaliteit is in ontwikkeling.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center h-48 flex items-center justify-center text-muted-foreground">
                        Hier kunt u binnenkort schades melden.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
