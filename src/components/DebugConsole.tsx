
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, ChevronsDown, TerminalSquare } from 'lucide-react';

interface LogMessage {
  timestamp: string;
  level: 'log' | 'error' | 'warn';
  message: string;
  data?: any[];
}

export default function DebugConsole() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
    };

    const addLog = (level: 'log' | 'error' | 'warn', message: any, ...data: any[]) => {
      // Run the state update in a timeout to de-couple it from the current render cycle.
      setTimeout(() => {
        const timestamp = new Date().toLocaleTimeString('nl-NL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        const logEntry: LogMessage = {
          timestamp,
          level,
          message: String(message),
          data: data.length > 0 ? data : undefined,
        };
        setLogs(prevLogs => [logEntry, ...prevLogs]);
      }, 0);
    };

    console.log = (message, ...args) => {
      addLog('log', message, ...args);
      originalConsole.log.apply(console, [message, ...args]);
    };
    console.error = (message, ...args) => {
      addLog('error', message, ...args);
      originalConsole.error.apply(console, [message, ...args]);
    };
    console.warn = (message, ...args) => {
      addLog('warn', message, ...args);
      originalConsole.warn.apply(console, [message, ...args]);
    };
    
    // Log a message to show the console is active
    console.log("Debug Console Initialized.");

    return () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
    };
  }, []);

  if (!isVisible) {
    return null;
  }
  
  if (isMinimized) {
    return (
        <div className="fixed bottom-4 right-4 z-50">
            <Button onClick={() => setIsMinimized(false)}>
                <TerminalSquare className="mr-2 h-4 w-4" />
                Open Debugger
            </Button>
        </div>
    )
  }

  const getLogColor = (level: LogMessage['level']) => {
    switch (level) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      default: return 'text-foreground';
    }
  }

  return (
    <Card className="fixed bottom-4 right-4 w-full max-w-lg max-h-80 z-50 shadow-2xl flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <CardTitle className="text-lg">Debug Console</CardTitle>
        <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLogs([])}>Clear</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(true)}>
                <ChevronsDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsVisible(false)}>
                <X className="h-4 w-4" />
            </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto">
        <div className="p-4 space-y-2">
          {logs.map((log, index) => (
            <div key={index} className={`font-mono text-xs p-2 rounded-sm ${log.level === 'error' ? 'bg-red-500/10' : log.level === 'warn' ? 'bg-yellow-500/10' : 'bg-muted/50'}`}>
              <div className="flex justify-between">
                <span className={getLogColor(log.level)}>{log.level.toUpperCase()}</span>
                <span className="text-muted-foreground">{log.timestamp}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{log.message}</p>
              {log.data && log.data.map((d, i) => (
                 <pre key={i} className="whitespace-pre-wrap break-all bg-background/50 p-2 mt-1 rounded text-muted-foreground">{JSON.stringify(d, null, 2)}</pre>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
