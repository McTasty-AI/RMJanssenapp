
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DamageReportPage() {

    return (
        <div className="space-y-8">
             <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Schade Melden</h1>
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
