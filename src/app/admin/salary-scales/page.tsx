"use client";

import { useState, useEffect } from 'react';
import { salaryScales } from '@/lib/salary-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, buttonVariants } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, UploadCloud, Bot, FileText, Check, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as pdfjs from 'pdfjs-dist';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { analyzeFunctieloonschaalDocument, type AnalyzeFunctieloonschaalDocumentOutput } from '@/ai/flows/analyze-functieloonschaal-document-flow';

const formatCurrency = (value: number) => `€ ${value.toFixed(2)}`;

export default function SalaryScalesPage() {
    const router = useRouter();
    const [currentScales, setCurrentScales] = useState(salaryScales);
    
    const [documentContent, setDocumentContent] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [analysisResult, setAnalysisResult] = useState<AnalyzeFunctieloonschaalDocumentOutput | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();

    // Set up the worker for pdf.js at runtime to avoid webpack import detection
    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Use import.meta.url at runtime - webpack won't detect this pattern
            try {
                const workerPath = 'pdfjs-dist/build/pdf.worker.min.mjs';
                pdfjs.GlobalWorkerOptions.workerSrc = new URL(workerPath, import.meta.url).toString();
            } catch (e) {
                // Fallback to CDN if import.meta.url fails (pdfjs-dist 3.11.174)
                pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs';
            }
        }
    }, []);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setIsProcessing(true);
        setAnalysisResult(null);
        setDocumentContent(null);

        try {
            let textContent = '';
            if (file.type === 'application/pdf') {
                 const reader = new FileReader();
                 reader.onload = async (e) => {
                    if (!e.target?.result) return;
                    const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
                    const pdf = await pdfjs.getDocument(typedArray).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent();
                        textContent += text.items.map(s => (s as any).str).join(' ');
                    }
                    setDocumentContent(textContent);
                    handleAnalyzeDocument(textContent);
                 };
                 reader.readAsArrayBuffer(file);
            } else {
                 textContent = await file.text();
                 setDocumentContent(textContent);
                 handleAnalyzeDocument(textContent);
            }
             toast({ title: 'Bestand succesvol geladen', description: 'De AI analyseert nu de inhoud...' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Bestand lezen mislukt' });
            setFileName('');
            setDocumentContent(null);
            setIsProcessing(false);
        }
    };
    
    const handleAnalyzeDocument = async (content: string) => {
        if (!content) {
            toast({ variant: 'destructive', title: 'Geen documentinhoud', description: 'Kan het document niet analyseren.' });
            setIsProcessing(false);
            return;
        }

        try {
            const result = await analyzeFunctieloonschaalDocument({ documentContent: content });
            setAnalysisResult(result);
            toast({ title: 'Analyse voltooid', description: 'De resultaten worden hieronder weergegeven.'});
        } catch (error) {
             console.error(error);
             toast({ variant: 'destructive', title: 'Analyse mislukt' });
        } finally {
             setIsProcessing(false);
        }
    }
    
    const handleUpdateSalaryData = () => {
        if (!analysisResult) return;
        
        const newScales: Record<string, any> = {};
        analysisResult.extractedScales.forEach(scale => {
            newScales[scale.scale] = {};
            scale.steps.forEach(step => {
                newScales[scale.scale][step.step] = {
                    week: step.week,
                    month: step.month,
                    hour100: step.hour100,
                    hour130: step.hour130,
                    hour150: step.hour150,
                };
            });
        });
        
        setCurrentScales(newScales);
        setAnalysisResult(null); // Hide the analysis card after updating
        toast({
            title: 'Loonschalen succesvol bijgewerkt!',
            description: 'De applicatie gebruikt nu de nieuwe waarden. Vergeet niet de wijzigingen op te slaan indien u in een ontwikkelomgeving werkt.'
        });
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Functieloonschalen</h1>
                    <p className="text-muted-foreground">Bekijk de huidige functieloonschalen en upload nieuwe waarden via AI.</p>
                </div>
            </div>
             <Button variant="ghost" onClick={() => router.push('/admin')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Terug naar Admin Dashboard
            </Button>
            
             <Card>
                <CardHeader>
                    <CardTitle>AI Loonschaal Analyse</CardTitle>
                    <CardDescription>
                       Upload een document met functieloonschalen (PDF of .txt). De AI zal de tabellen uitlezen en de geëxtraheerde data hieronder tonen.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input id="doc-upload" type="file" onChange={handleFileChange} className="hidden" accept=".pdf,.txt" disabled={isProcessing} />
                        <Label htmlFor="doc-upload" className={cn("flex-grow", buttonVariants({ variant: 'outline' }), isProcessing && "cursor-not-allowed opacity-50")}>
                             {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                            {isProcessing ? 'Bestand verwerken...' : (fileName || 'Kies een document')}
                        </Label>
                    </div>
                </CardContent>
            </Card>

            {analysisResult && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Geëxtraheerde Loonschalen</CardTitle>
                        <CardDescription>Dit is de data die de AI uit het document heeft gehaald. Controleer de gegevens voordat u deze overneemt.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <Tabs defaultValue={analysisResult.extractedScales[0]?.scale} className="w-full">
                            <TabsList>
                                {analysisResult.extractedScales.map(scale => (
                                    <TabsTrigger key={scale.scale} value={scale.scale}>Schaal {scale.scale}</TabsTrigger>
                                ))}
                            </TabsList>
                            {analysisResult.extractedScales.map(scale => (
                                <TabsContent key={scale.scale} value={scale.scale}>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[100px]">Trede</TableHead>
                                                <TableHead>Per Week</TableHead>
                                                <TableHead>Per Maand</TableHead>
                                                <TableHead>Uurloon 100%</TableHead>
                                                <TableHead>Uurloon 130%</TableHead>
                                                <TableHead>Uurloon 150%</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {scale.steps.map((stepData) => (
                                                <TableRow key={stepData.step}>
                                                    <TableCell className="font-medium">{stepData.step}</TableCell>
                                                    <TableCell>{formatCurrency(stepData.week)}</TableCell>
                                                    <TableCell>{formatCurrency(stepData.month)}</TableCell>
                                                    <TableCell>{formatCurrency(stepData.hour100)}</TableCell>
                                                    <TableCell>{formatCurrency(stepData.hour130)}</TableCell>
                                                    <TableCell>{formatCurrency(stepData.hour150)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TabsContent>
                            ))}
                        </Tabs>
                    </CardContent>
                    <CardFooter className="justify-end">
                         <Button onClick={handleUpdateSalaryData}>
                            <Check className="mr-2 h-4 w-4"/> Data Overnemen
                        </Button>
                    </CardFooter>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Huidige Actieve Functieloonschalen</CardTitle>
                    <CardDescription>
                        Dit is een overzicht van de loonschalen die momenteel in de applicatie worden gebruikt voor alle berekeningen.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue={Object.keys(currentScales)[0]} className="w-full">
                        <TabsList>
                            {Object.keys(currentScales).map(scale => (
                                <TabsTrigger key={scale} value={scale}>Schaal {scale}</TabsTrigger>
                            ))}
                        </TabsList>
                        {Object.entries(currentScales).map(([scale, steps]) => (
                            <TabsContent key={scale} value={scale}>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">Trede</TableHead>
                                            <TableHead>Per Week</TableHead>
                                            <TableHead>Per Maand</TableHead>
                                            <TableHead>Uurloon 100%</TableHead>
                                            <TableHead>Uurloon 130%</TableHead>
                                            <TableHead>Uurloon 150%</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Object.entries(steps).map(([step, data]: [string, any]) => (
                                            <TableRow key={step}>
                                                <TableCell className="font-medium">{step}</TableCell>
                                                <TableCell>{formatCurrency(data.week)}</TableCell>
                                                <TableCell>{formatCurrency(data.month)}</TableCell>
                                                <TableCell>{formatCurrency(data.hour100)}</TableCell>
                                                <TableCell>{formatCurrency(data.hour130)}</TableCell>
                                                <TableCell>{formatCurrency(data.hour150)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                        ))}
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
