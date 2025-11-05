
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WeeklyLog from "@/components/dashboard/WeeklyLog";
import MonthlyReport from "@/components/dashboard/MonthlyReport";
import MonthlyCalendar from "@/components/dashboard/MonthlyCalendar";
import { useAuth } from "@/hooks/use-auth";
import { getDateFromWeekId } from "@/lib/utils";

export default function TimesheetsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const weekIdFromUrl = searchParams.get('week');
  const tabFromUrl = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (weekIdFromUrl) {
      const dateFromUrl = getDateFromWeekId(weekIdFromUrl);
      if (dateFromUrl) {
        setCurrentDate(dateFromUrl);
        setActiveTab("weekly");
      }
    }
    
    // Also check for tab parameter
    if (tabFromUrl && ['calendar', 'weekly', 'monthly'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [weekIdFromUrl, tabFromUrl]);

  return (
    <div className="w-full max-w-[90%] mx-auto p-4 md:p-8">
       <div className="flex justify-between items-center mb-8">
            <div>
                <h1 className="text-2xl font-bold">Urenregistratie</h1>
                <p className="text-muted-foreground">Dien hier uw wekelijkse uren in en bekijk uw maandoverzicht.</p>
            </div>
        </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:max-w-lg md:mx-auto">
          <TabsTrigger value="calendar">Maandstaat</TabsTrigger>
          <TabsTrigger value="weekly">Weekstaat</TabsTrigger>
          <TabsTrigger value="monthly">Maandoverzicht</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-6">
          <MonthlyCalendar />
        </TabsContent>
        <TabsContent value="weekly" className="mt-6">
          <WeeklyLog selectedDate={currentDate} onDateChange={setCurrentDate} />
        </TabsContent>
        <TabsContent value="monthly" className="mt-6">
          <MonthlyReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
