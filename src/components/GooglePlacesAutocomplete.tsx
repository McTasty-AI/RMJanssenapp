"use client";

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    google: any;
  }
}
declare const google: any;

interface GooglePlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder?: string;
  className?: string;
}

const GooglePlacesAutocomplete: React.FC<GooglePlacesAutocompleteProps> = ({
  value,
  onChange,
  onBlur,
  placeholder,
  className
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    if (!(typeof window !== 'undefined' && window.google && window.google.maps && window.google.maps.places)) {
      console.error("Google Maps Places API not loaded");
      return;
    }

    if (inputRef.current && !autocompleteRef.current) {
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'nl' },
        fields: ['formatted_address']
      });

      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace();
        if (place?.formatted_address) {
          onChange(place.formatted_address);
        }
      });
    }

    return () => {
        if (autocompleteRef.current && window.google?.maps?.event?.clearInstanceListeners) {
            window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
            // The following line can cause issues if the component unmounts unexpectedly.
            // It's often better to just clear listeners.
            // autocompleteRef.current = null;
        }
    };
  }, [onChange]);
  
  // Set the input value programmatically if it changes from the form state
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);


  return (
    <input
      ref={inputRef}
      placeholder={placeholder}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value)} // Keep this to allow manual typing
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      defaultValue={value} // Use defaultValue to avoid controlled/uncontrolled issue on re-renders
    />
  );
};

export default GooglePlacesAutocomplete;
