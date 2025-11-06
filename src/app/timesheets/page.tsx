
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
    <div className="w-full">
       <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Urenregistratie</h1>
                <p className="text-sm sm:text-base text-muted-foreground">Dien hier uw wekelijkse uren in en bekijk uw maandoverzicht.</p>
            </div>
        </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:max-w-lg md:mx-auto">
          <TabsTrigger value="calendar" className="text-xs sm:text-sm">Maandstaat</TabsTrigger>
          <TabsTrigger value="weekly" className="text-xs sm:text-sm">Weekstaat</TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs sm:text-sm">Maandoverzicht</TabsTrigger>
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
