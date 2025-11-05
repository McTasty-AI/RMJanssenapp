"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GeneratePage() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Genereer Jaarlijkse Weekstaten</h1>
          <p className="text-muted-foreground">Deze functie is momenteel niet in gebruik.</p>
        </div>
      </div>
      <Card className="max-w-xl mx-auto">
        <CardContent>
          <p>Deze functie is momenteel niet in gebruik.</p>
        </CardContent>
      </Card>
    </div>
  );
}
