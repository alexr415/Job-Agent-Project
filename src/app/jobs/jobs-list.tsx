"use client";

import { useMemo, useState } from "react";
import type { Job } from "@/lib/jobs";

// Filtering and sorting run in the browser: a few hundred roles is small
// enough to send at once, and it keeps every filter change instant.

const LOCATION_PRESETS: { label: string; pattern: RegExp }[] = [
  {
    label: "SF Bay Area",
    pattern:
      /san francisco|bay area|palo alto|mountain view|menlo park|san jose|oakland|sunnyvale|redwood city|san mateo|foster city|santa clara|berkeley|emeryville|cupertino/i,
  },
  { label: "Remote", pattern: /remote/i },
  { label: "New York", pattern: /new york|nyc|brooklyn/i },
];

type Sort = "found" | "posted" | "match";

const inputClass =
  "rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs transition ${
    active
      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
      : "border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
  }`;

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Share of required skills the resume covers; unanalyzed roles sort last.
function matchScore(job: Job): number {
  if (!job.analyzed) return -1;
  if (job.requiredSkills.length === 0) return 1;
  return (job.requiredSkills.length - job.missingSkills.length) / job.requiredSkills.length;
}

function experienceLabel(job: Job): string {
  if (!job.analyzed) return "Not analyzed yet";
  if (job.yearsExperience === null) return "Experience not stated";
  if (job.yearsExperience === 0) return "No experience required";
  return `${job.yearsExperience}+ ${job.yearsExperience === 1 ? "year" : "years"}`;
}

function JobCard({ job }: { job: Job }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? job.locations : job.locations.slice(0, 4);
  const have = job.requiredSkills.length - job.missingSkills.length;

  return (
    <li className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-medium">
          {job.locations[0]?.url ? (
            <a href={job.locations[0].url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {job.title}
            </a>
          ) : (
            job.title
          )}
        </h3>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{job.company}</span>
        {job.isNew && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            New
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm">
        <span className="text-neutral-500 dark:text-neutral-400">Apply: </span>
        {visible.map((loc, i) => (
          <span key={`${loc.location}-${i}`}>
            {i > 0 && <span className="text-neutral-400"> · </span>}
            {loc.url ? (
              <a
                href={loc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
              >
                {loc.location}
              </a>
            ) : (
              loc.location
            )}
          </span>
        ))}
        {job.locations.length > 4 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="ml-1.5 text-xs text-neutral-500 hover:underline"
          >
            {showAll ? "show fewer" : `+${job.locations.length - 4} more`}
          </button>
        )}
      </p>

      <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        {[
          experienceLabel(job),
          job.postedAt && `Posted ${formatDay(job.postedAt)}`,
          `Found ${formatDay(job.firstSeenAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {job.analyzed && job.requiredSkills.length > 0 && (
        <div className="mt-2.5 text-sm">
          <span className="font-medium">
            You have {have} of {job.requiredSkills.length} required skills
          </span>
          {job.missingSkills.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Missing:</span>
              {job.missingSkills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs dark:border-neutral-800"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function JobsList({ jobs }: { jobs: Job[] }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [preset, setPreset] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  // Recently posted first by default: applying early matters more than anything else here.
  const [sort, setSort] = useState<Sort>("posted");

  const companies = useMemo(() => [...new Set(jobs.map((j) => j.company))].sort(), [jobs]);
  const newCount = jobs.filter((j) => j.isNew).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    const presetPattern = LOCATION_PRESETS.find((p) => p.label === preset)?.pattern;

    const filtered = jobs.filter((job) => {
      if (q && !`${job.title} ${job.company}`.toLowerCase().includes(q)) return false;
      if (company && job.company !== company) return false;
      if (newOnly && !job.isNew) return false;
      const places = job.locations.map((l) => l.location);
      if (presetPattern && !places.some((p) => presetPattern.test(p))) return false;
      if (loc && !places.some((p) => p.toLowerCase().includes(loc))) return false;
      return true;
    });

    const byDate = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");
    const day = (iso: string) => iso.slice(0, 10); // roles found in the same run tie, then fall back to posted date
    return filtered.sort((a, b) => {
      if (sort === "match") return matchScore(b) - matchScore(a) || byDate(a.postedAt, b.postedAt);
      if (sort === "posted") return byDate(a.postedAt, b.postedAt);
      return byDate(day(a.firstSeenAt), day(b.firstSeenAt)) || byDate(a.postedAt, b.postedAt);
    });
  }, [jobs, query, location, preset, company, newOnly, sort]);

  return (
    <div>
      <div className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            aria-label="Search title or company"
            placeholder="Search title or company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
          />
          <input
            type="search"
            aria-label="Filter by location"
            placeholder="Location, e.g. Seattle"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
          <select
            aria-label="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className={inputClass}
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort by"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={inputClass}
          >
            <option value="posted">Recently posted</option>
            <option value="found">Newest found</option>
            <option value="match">Best match for you</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {LOCATION_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={preset === p.label}
              onClick={() => setPreset(preset === p.label ? null : p.label)}
              className={chipClass(preset === p.label)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={newOnly}
            onClick={() => setNewOnly(!newOnly)}
            className={chipClass(newOnly)}
          >
            New only ({newCount})
          </button>
        </div>
      </div>

      <p className="mt-4 mb-3 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
        Showing {shown.length} of {jobs.length} roles
      </p>
      {shown.length === 0 ? (
        <p className="text-sm text-neutral-500">No roles match these filters.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((job) => (
            <JobCard key={job.key} job={job} />
          ))}
        </ul>
      )}
    </div>
  );
}
