
"use client"

import * as React from "react"
import { format, startOfYear, endOfYear, getYear, getMonth, setMonth, setYear, startOfQuarter, endOfQuarter, addYears, subYears, endOfMonth } from "date-fns"
import { nl } from "date-fns/locale"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

interface DateRangePickerProps {
  className?: string;
  value: DateRange | undefined
  onChange: (dateRange: DateRange | undefined) => void
}

export function DateRangePicker({ className, value, onChange }: DateRangePickerProps) {
    const [open, setOpen] = React.useState(false)
    const [displayYear, setDisplayYear] = React.useState(getYear(value?.from || new Date()))

    const handleSelect = (range: DateRange | undefined) => {
        onChange(range)
    }

    const handleYearChange = (year: number) => {
        setDisplayYear(year)
    }

    const handleQuickSelect = (type: 'month' | 'quarter', value: number) => {
        const year = displayYear
        if (type === 'month') {
            const from = setMonth(new Date(year, value, 1), value)
            const to = endOfMonth(from)
            onChange({ from, to })
        } else { // quarter
            const from = startOfQuarter(new Date(year, (value-1) * 3, 1))
            const to = endOfQuarter(from)
            onChange({ from, to })
        }
        setOpen(false)
    }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, "LLL dd, y", { locale: nl })} -{" "}
                  {format(value.to, "LLL dd, y", { locale: nl })}
                </>
              ) : (
                format(value.from, "LLL dd, y", { locale: nl })
              )
            ) : (
              <span>Kies een datum</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
            <div className="flex items-center justify-between p-2">
                <Button variant="ghost" size="icon" onClick={() => handleYearChange(displayYear - 1)}><ChevronsLeft className="h-4 w-4" /></Button>
                <div className="text-sm font-semibold">{displayYear}</div>
                <Button variant="ghost" size="icon" onClick={() => handleYearChange(displayYear + 1)}><ChevronsRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2">
                {Array.from({ length: 12 }).map((_, i) => (
                    <Button key={i} variant="ghost" size="sm" onClick={() => handleQuickSelect('month', i)}>
                        {format(new Date(displayYear, i, 1), 'LLL', { locale: nl })}
                    </Button>
                ))}
            </div>
            <div className="grid grid-cols-4 gap-2 p-2 border-t">
                 {Array.from({ length: 4 }).map((_, i) => (
                    <Button key={i} variant="outline" size="sm" onClick={() => handleQuickSelect('quarter', i+1)}>
                        K{i+1}
                    </Button>
                ))}
            </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
