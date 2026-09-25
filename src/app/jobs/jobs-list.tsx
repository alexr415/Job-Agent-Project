"use client";

import { useMemo, useState } from "react";
import { daysSincePosted, FRESH_DAYS, MONTH_DAYS, postedDate, WEEK_DAYS } from "@/lib/freshness";
import type { Job } from "@/lib/jobs";
import { PostedBadge } from "../components/posted-badge";

// Filtering and sorting run in the browser: a few hundred roles is small
// enough to send at once, and it keeps every filter change instant.
// Roles are grouped by how recently they were posted, because applying early
// is the biggest edge this tool can give.

const LOCATION_PRESETS: { label: string; pattern: RegExp }[] = [
  {
    label: "SF Bay Area",
    pattern:
      /san francisco|bay area|palo alto|mountain view|menlo park|san jose|oakland|sunnyvale|redwood city|san mateo|foster city|santa clara|berkeley|emeryville|cupertino/i,
  },
  { label: "Remote", pattern: /remote/i },
  { label: "New York", pattern: /new york|nyc|brooklyn/i },
];

const SECTIONS = [
  { title: `Posted in the last ${FRESH_DAYS} days`, note: "Apply to these first.", maxDays: FRESH_DAYS },
  { title: "Posted this week", note: null, maxDays: WEEK_DAYS },
  { title: "Posted this month", note: null, maxDays: MONTH_DAYS },
  {
    title: "Older than a month",
    note: "Often evergreen postings or roles already deep into interviews.",
    maxDays: Infinity,
  },
];

type Sort = "newest" | "match";

const inputClass =
  "rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs transition ${
    active
      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
      : "border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
  }`;

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

function JobCard({ job, now }: { job: Job; now: number }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? job.locations : job.locations.slice(0, 4);
  const have = job.requiredSkills.length - job.missingSkills.length;

  return (
    <li className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
        <PostedBadge job={job} now={now} />
        {job.isNew && (
          <span className="rounded-full border border-emerald-300 px-2 py-0.5 text-xs text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">
            Just found
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

      <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">{experienceLabel(job)}</p>

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

function JobGroup({ title, note, jobs, now }: { title: string; note: string | null; jobs: Job[]; now: number }) {
  return (
    <section>
      {title && (
        <h2 className="text-sm font-semibold">
          {title} <span className="font-normal text-neutral-500">({jobs.length})</span>
        </h2>
      )}
      {note && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{note}</p>}
      {jobs.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">None right now.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.key} job={job} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function JobsList({ jobs, now }: { jobs: Job[]; now: number }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [preset, setPreset] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [justFound, setJustFound] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");

  const companies = useMemo(() => [...new Set(jobs.map((j) => j.company))].sort(), [jobs]);
  const justFoundCount = jobs.filter((j) => j.isNew).length;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    const presetPattern = LOCATION_PRESETS.find((p) => p.label === preset)?.pattern;

    const filtered = jobs.filter((job) => {
      if (q && !`${job.title} ${job.company}`.toLowerCase().includes(q)) return false;
      if (company && job.company !== company) return false;
      if (justFound && !job.isNew) return false;
      const places = job.locations.map((l) => l.location);
      if (presetPattern && !places.some((p) => presetPattern.test(p))) return false;
      if (loc && !places.some((p) => p.toLowerCase().includes(loc))) return false;
      return true;
    });

    const newestFirst = (a: Job, b: Job) => postedDate(b).localeCompare(postedDate(a));
    filtered.sort(sort === "match" ? (a, b) => matchScore(b) - matchScore(a) || newestFirst(a, b) : newestFirst);

    return SECTIONS.map((section, i) => {
      const minDays = i === 0 ? -1 : SECTIONS[i - 1].maxDays; // each section starts where the previous ended
      const inSection = filtered.filter((job) => {
        const days = daysSincePosted(job, now);
        return days > minDays && days <= section.maxDays;
      });
      return { ...section, jobs: inSection };
    });
  }, [jobs, now, query, location, preset, company, justFound, sort]);

  const total = groups.reduce((n, g) => n + g.jobs.length, 0);
  const [recent, older] = [groups.slice(0, -1), groups.at(-1)!];

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
            aria-label="Sort within each group"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={inputClass}
          >
            <option value="newest">Newest first</option>
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
            aria-pressed={justFound}
            onClick={() => setJustFound(!justFound)}
            className={chipClass(justFound)}
            title="Roles that first appeared in the latest run"
          >
            Just found ({justFoundCount})
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
        Showing {total} of {jobs.length} roles
      </p>

      <div className="mt-4 space-y-8">
        {recent.map((g) => (
          <JobGroup key={g.title} title={g.title} note={g.note} jobs={g.jobs} now={now} />
        ))}
        {older.jobs.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              {older.title} <span className="font-normal text-neutral-500">({older.jobs.length})</span>
            </summary>
            <div className="mt-3">
              <JobGroup title="" note={older.note} jobs={older.jobs} now={now} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
