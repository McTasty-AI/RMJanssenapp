
"use client";

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import * as pdfjs from 'pdfjs-dist';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, UploadCloud, Bot } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { analyzeCaoDocument } from '@/ai/flows/analyze-cao-document-flow';

// Set up the worker for pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function AdminCaoPage() {
    const router = useRouter();
    const [documentContent, setDocumentContent] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [query, setQuery] = useState<string>('');
    const [answer, setAnswer] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setIsProcessing(true);
        setAnswer('');
        setDocumentContent(null);

        try {
            if (file.type === 'application/pdf') {
                 const reader = new FileReader();
                 reader.onload = async (e) => {
                    if (!e.target?.result) return;
                    const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
                    const pdf = await pdfjs.getDocument(typedArray).promise;
                    let textContent = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent();
                        textContent += text.items.map(s => (s as any).str).join(' ');
                    }
                    setDocumentContent(textContent);
                 };
                 reader.readAsArrayBuffer(file);
            } else {
                 const text = await file.text();
                 setDocumentContent(text);
            }
             toast({ title: 'Bestand succesvol geladen', description: 'U kunt nu vragen stellen over het document.' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Bestand lezen mislukt' });
            setFileName('');
            setDocumentContent(null);
        } finally {
             setIsProcessing(false);
        }
    };
    
    const handleAnalyzeQuery = async () => {
        if (!documentContent || !query) {
            toast({ variant: 'destructive', title: 'Geen document of vraag', description: 'Upload eerst een document en stel een vraag.' });
            return;
        }

        setIsProcessing(true);
        try {
            const result = await analyzeCaoDocument({ documentContent, query });
            setAnswer(result.answer);
        } catch (error) {
             console.error(error);
             toast({ variant: 'destructive', title: 'Analyse mislukt' });
        } finally {
             setIsProcessing(false);
        }
    }


    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">CAO Analyse</h1>
                    <p className="text-muted-foreground">Upload een CAO-document en stel een specifieke vraag om snel informatie te vinden.</p>
                </div>
            </div>
            <Card className="max-w-3xl mx-auto">
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input id="doc-upload" type="file" onChange={handleFileChange} className="hidden" accept=".pdf,.txt" />
                        <Label htmlFor="doc-upload" className={cn("flex-grow", buttonVariants({ variant: 'outline' }))}>
                            <UploadCloud className="mr-2 h-4 w-4" />
                            {fileName || 'Kies een document'}
                        </Label>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <Input
                            placeholder="Stel een vraag, bijv. 'Wat is de opzegtermijn tijdens proeftijd?'"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={!documentContent || isProcessing}
                        />
                        <Button onClick={handleAnalyzeQuery} disabled={isProcessing || !documentContent || !query}>
                            {isProcessing ? <Loader2 className="animate-spin" /> : <Bot />}
                        </Button>
                    </div>
                    
                    {answer && (
                        <div className="mt-4 p-4 bg-primary/10 rounded-md border border-primary/20">
                            <p className="font-semibold text-primary">Antwoord van AI:</p>
                            <p className="text-sm text-primary/90 whitespace-pre-wrap">{answer}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
