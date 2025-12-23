alter table if exists toll_entries
  add column if not exists usage_time text;

comment on column toll_entries.usage_time is 'Optioneel tijdstip (HH:MM) om dubbele tolritten beter te onderscheiden';
