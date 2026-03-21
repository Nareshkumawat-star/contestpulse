/* ============================================================
   ContestPulse – script.js
   Main logic: API, filtering, countdown, notifications, settings
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────────
let allContests = [];
let filteredContests = [];
let activeFilter = 'all';
let activeTypeFilter = 'all';
let refreshTimer = null;
let countdownIntervals = {};
let scheduledNotifs = [];
let firedNotifs = [];
try { firedNotifs = JSON.parse(localStorage.getItem('contestWidgetFired') || '[]'); } catch (e) { }
let syncedNotifs = [];
try { syncedNotifs = JSON.parse(localStorage.getItem('contestWidgetSynced') || '[]'); } catch (e) { }
let settings = loadSettings();
let miniWidgetTimer = null;
let isMiniMode = true;

function setMiniMode(mini) {
    isMiniMode = mini;
    if (mini) {
        document.getElementById('fullApp').style.display = 'none';
        document.getElementById('miniApp').style.display = 'flex';
        if (window.electronAPI) window.electronAPI.setWindowSize(200, 200);
    } else {
        document.getElementById('miniApp').style.display = 'none';
        document.getElementById('fullApp').style.display = 'flex';
        if (window.electronAPI) window.electronAPI.setWindowSize(320, 470);
    }
}

function updateMiniWidgetTick(nextContest) {
    if (miniWidgetTimer) clearInterval(miniWidgetTimer);
    if (!nextContest) return;

    const startMs = parseContestTime(nextContest.start_time).getTime();
    const endMs = getContestEndMs(nextContest);

    const tick = () => {
        const now = Date.now();
        const isLive = startMs <= now && (endMs ? endMs > now : true);
        const remaining = isLive ? (endMs ? endMs - now : 0) : startMs - now;

        const timeEl = document.getElementById('miniNextTime');
        const dotEl = document.getElementById('miniLiveIndicator');
        const labelEl = document.querySelector('.mini-label');
        const iconEl = document.getElementById('miniIcon');

        if (timeEl) timeEl.textContent = formatCountdown(remaining, isLive);

        if (iconEl && nextContest) {
            const platform = detectPlatform(nextContest);
            iconEl.textContent = PLATFORM_MAP[platform]?.emoji || '🏆';
        }

        if (isLive) {
            if (timeEl) timeEl.classList.add('live');
            if (dotEl) dotEl.style.display = 'block';
            if (labelEl) labelEl.textContent = 'ONGOING CONTEST';
        } else {
            if (timeEl) timeEl.classList.remove('live');
            if (dotEl) dotEl.style.display = 'none';
            if (labelEl) labelEl.textContent = 'UPCOMING CONTEST';
        }
    };
    tick();
    miniWidgetTimer = setInterval(tick, 1000);
}

// ── DOM refs ───────────────────────────────────────────────────
const contestList = document.getElementById('contestList');
const loadingState = document.getElementById('loadingState');
const contestCount = document.getElementById('contestCount');
const lastRefresh = document.getElementById('lastRefresh');
const filterBar = document.getElementById('filterBar');
const typeFilterBar = document.getElementById('typeFilterBar');
const settingsPanel = document.getElementById('settingsPanel');
const aboutPanel = document.getElementById('aboutPanel');
const onlineStatus = document.getElementById('onlineStatus');

// ── Platform display helpers ───────────────────────────────────
const PLATFORM_MAP = {
    codeforces: { name: 'Codeforces', badge: 'badge-codeforces', emoji: '🟦' },
    leetcode: { name: 'LeetCode', badge: 'badge-leetcode', emoji: '🔶' },
    codechef: { name: 'CodeChef', badge: 'badge-codechef', emoji: '👨‍🍳' },
    hackerearth: { name: 'HackerEarth', badge: 'badge-hackerearth', emoji: '🌍' },
    hackerrank: { name: 'HackerRank', badge: 'badge-hackerrank', emoji: '🟩' },
    topcoder: { name: 'TopCoder', badge: 'badge-topcoder', emoji: '⚔️' },
};

// Skill-level → recommended platforms
const SKILL_PLATFORMS = {
    beginner: ['hackerrank', 'codechef', 'leetcode'],
    intermediate: ['codeforces', 'codechef', 'leetcode'],
    advanced: ['codeforces', 'topcoder'],
    all: [],
};

// ── Mock fallback data (shown when API is unreachable) ─────────
// Numbers are realistic for March 2026.
function _mockStart(hoursFromNow) {
    return new Date(Date.now() + hoursFromNow * 3600 * 1000).toISOString();
}
function _mockEnd(hoursFromNow, durH) {
    return new Date(Date.now() + (hoursFromNow + durH) * 3600 * 1000).toISOString();
}
const MOCK_CONTESTS = [
    {
        name: 'Weekly Contest 494',
        url: 'https://leetcode.com/contest/weekly-contest-494/',
        start_time: _mockStart(81.5), // Sun Mar 22 morning
        end_time: _mockEnd(81.5, 1.5),
        duration: '1:30:00',
        site: 'leetcode.com',
        status: 'BEFORE',
    },
    {
        name: 'Codeforces Round 1116 (Div. 2)',
        url: 'https://codeforces.com/contests/1116',
        start_time: _mockStart(48), // Friday
        end_time: _mockEnd(48, 2),
        duration: '2:00:00',
        site: 'codeforces.com',
        status: 'BEFORE',
    },
    {
        name: 'Educational Codeforces Round 175 (Rated for Div. 2)',
        url: 'https://codeforces.com/contests/edu-175',
        start_time: _mockStart(96), // Sunday night
        end_time: _mockEnd(96, 2),
        duration: '2:00:00',
        site: 'codeforces.com',
        status: 'BEFORE',
    },
    {
        name: 'CodeChef Starters 231 (Div. 1, 2, 3, 4)',
        url: 'https://www.codechef.com/START231',
        start_time: _mockStart(165.5), // Wed Mar 25 20:00 IST
        end_time: _mockEnd(165.5, 3),
        duration: '3:00:00',
        site: 'codechef.com',
        status: 'BEFORE',
    },
    {
        name: 'Biweekly Contest 179',
        url: 'https://leetcode.com/contest/biweekly-contest-179/',
        start_time: _mockStart(237.5), // Sat Mar 28
        end_time: _mockEnd(237.5, 1.5),
        duration: '1:30:00',
        site: 'leetcode.com',
        status: 'BEFORE',
    }
];

// ── Safe UTC date parser ───────────────────────────────────────
// Kontests API returns strings like "2025-03-23 16:30:00 UTC" which
// JavaScript may mis-parse as local time.  We normalise to ISO 8601
// ("2025-03-23T16:30:00Z") so it is always treated as UTC.
function parseContestTime(raw) {
    if (!raw) return new Date(NaN);
    let s = String(raw).trim();
    // "2025-03-23 16:30:00 UTC"  →  "2025-03-23T16:30:00Z"
    s = s.replace(/\s+UTC$/i, 'Z').replace(' ', 'T');
    // If still no Z / offset at end and looks like "YYYY-MM-DDTHH:MM:SS"
    // treat it as UTC explicitly
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += 'Z';
    const d = new Date(s);
    return isNaN(d) ? new Date(raw) : d; // fallback to raw parse
}

// ── Detect platform from site or name ─────────────────────────
function detectPlatform(contest) {
    const site = (contest.site || '').toLowerCase();
    const name = (contest.name || '').toLowerCase();
    for (const key of Object.keys(PLATFORM_MAP)) {
        if (site.includes(key) || name.includes(key)) return key;
    }
    return 'default';
}

// ── Fetch contests from ALL sources for maximum reliability ──────────────
async function fetchContests() {
    const fetchKontests = async () => {
        try {
            const res = await fetch('https://kontests.net/api/v1/all', { signal: AbortSignal.timeout(5000) });
            if (res.ok) return await res.json();
        } catch (e) { }
        return [];
    };

    const fetchHR = async () => {
        try {
            const res = await fetch('https://www.hackerrank.com/rest/contests/upcoming?limit=20', { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            if (data && data.models) {
                const nowSec = Date.now() / 1000;
                return data.models.map(c => ({
                    name: c.name,
                    url: `https://www.hackerrank.com/contests/${c.slug}`,
                    start_time: new Date(c.epoch_starttime * 1000).toISOString(),
                    end_time: new Date(c.epoch_endtime * 1000).toISOString(),
                    duration: String(c.epoch_endtime - c.epoch_starttime),
                    site: 'HackerRank',
                    status: (c.epoch_starttime < nowSec) ? 'CODING' : 'BEFORE'
                }));
            }
        } catch (e) { console.error('HR failed:', e); }
        return [];
    };

    const fetchHE = async () => {
        try {
            const res = await fetch('https://www.hackerearth.com/chrome-extension/events/', { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            if (data && data.response) {
                const now = new Date();
                return data.response.map(c => {
                    const start = new Date(c.start_utc_tz || c.start_timestamp);
                    const end = new Date(c.end_utc_tz || c.end_timestamp);
                    return {
                        name: c.title,
                        url: c.url,
                        start_time: isNaN(start.getTime()) ? new Date().toISOString() : start.toISOString(),
                        end_time: isNaN(end.getTime()) ? null : end.toISOString(),
                        duration: !isNaN(end.getTime()) && !isNaN(start.getTime()) ? String((end - start) / 1000) : null,
                        site: 'HackerEarth',
                        status: (start < now) ? 'CODING' : 'BEFORE'
                    };
                });
            }
        } catch (e) { console.error('HE failed:', e); }
        return [];
    };

    const fetchCF = async () => {
        try {
            const res = await fetch('https://codeforces.com/api/contest.list', { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            if (data.status === 'OK') {
                return data.result.filter(c => c.phase === 'BEFORE' || c.phase === 'CODING').map(c => ({
                    name: c.name,
                    url: `https://codeforces.com/contests/${c.id}`,
                    start_time: new Date(c.startTimeSeconds * 1000).toISOString(),
                    end_time: new Date((c.startTimeSeconds + c.durationSeconds) * 1000).toISOString(),
                    duration: String(c.durationSeconds),
                    site: 'CodeForces',
                    status: c.phase
                }));
            }
        } catch (e) { console.error('CF failed:', e); }
        return [];
    };

    const fetchLC = async () => {
        try {
            const query = `{ allContests { title titleSlug startTime duration } }`;
            const res = await fetch('https://leetcode.com/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
                signal: AbortSignal.timeout(5000)
            });
            const data = await res.json();
            const nowSec = Date.now() / 1000;
            const contests = data.data.allContests.filter(c => c.startTime + c.duration > nowSec);
            return contests.map(c => ({
                name: c.title,
                url: `https://leetcode.com/contest/${c.titleSlug}`,
                start_time: new Date(c.startTime * 1000).toISOString(),
                end_time: new Date((c.startTime + c.duration) * 1000).toISOString(),
                duration: String(c.duration),
                site: 'LeetCode',
                status: (c.startTime < nowSec) ? 'CODING' : 'BEFORE'
            }));
        } catch (e) { console.error('LC failed:', e); }
        return [];
    };

    const fetchCC = async () => {
        try {
            const res = await fetch('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all', { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            const contests = [...(data.present_contests || []), ...(data.future_contests || [])];
            return contests.map(c => ({
                name: c.contest_name || c.contest_code,
                url: `https://www.codechef.com/${c.contest_code}`,
                start_time: c.contest_start_date_iso,
                end_time: c.contest_end_date_iso,
                duration: String(Number(c.contest_duration) * 60),
                site: 'CodeChef',
                status: (data.present_contests || []).some(pc => pc.contest_code === c.contest_code) ? 'CODING' : 'BEFORE'
            }));
        } catch (e) { console.error('CC failed:', e); }
        return [];
    };

    try {
        const results = await Promise.all([fetchKontests(), fetchHR(), fetchHE(), fetchCF(), fetchLC(), fetchCC()]);
        const combined = results.flat();

        // Deduplicate by URL
        const unique = [];
        const seenUrls = new Set();
        for (const c of combined) {
            if (c && c.url && !seenUrls.has(c.url)) {
                seenUrls.add(c.url);
                unique.push(c);
            }
        }

        if (unique.length > 0) {
            onlineStatus.classList.remove('offline');
            onlineStatus.title = 'API Online';
            return unique;
        }
    } catch (e) {
        console.error('Parallel fetch failed:', e);
    }

    // All APIs failed → use mock
    onlineStatus.classList.add('offline');
    onlineStatus.title = 'API Offline – showing demo data';
    return MOCK_CONTESTS;
}

// ── Helper to get contest end time in MS ───────────────────────
function getContestEndMs(contest) {
    if (contest.end_time) {
        const d = parseContestTime(contest.end_time).getTime();
        if (!isNaN(d)) return d;
    }
    const start = parseContestTime(contest.start_time).getTime();
    if (isNaN(start)) return null;

    // Parse duration string if no explicit end_time
    let durMs = 0;
    if (contest.duration) {
        if (!isNaN(Number(contest.duration))) {
            durMs = Number(contest.duration) * 1000;
        } else {
            const match = String(contest.duration).match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
            if (match) durMs = (parseInt(match[1]) * 3600 + parseInt(match[2]) * 60) * 1000;
        }
    }
    return durMs > 0 ? start + durMs : null;
}



// ── Process & sort contests ────────────────────────────────────
function processContests(raw) {
    const now = Date.now();
    const futureWindow = now + (14 * 24 * 60 * 60 * 1000); // 14 days ahead

    return raw
        .filter(c => {
            const start = parseContestTime(c.start_time).getTime();
            const end = getContestEndMs(c);
            if (isNaN(start)) return false;

            const name = (c.name || '').toLowerCase();
            const platform = detectPlatform(c);
            const windowLimit = futureWindow;

            // Filter: (Upcoming within window limit) OR (Currently LIVE)
            const isUpcoming = start > now && start <= windowLimit;
            const isLive = start <= now && (end ? end > now : true);

            return isUpcoming || isLive;
        })
        .sort((a, b) => {
            // Sort LIVE contests first, then by start time
            const aStart = parseContestTime(a.start_time).getTime();
            const bStart = parseContestTime(b.start_time).getTime();
            const aEnd = getContestEndMs(a);
            const bEnd = getContestEndMs(b);
            const aLive = aStart <= now && (aEnd ? aEnd > now : true);
            const bLive = bStart <= now && (bEnd ? bEnd > now : true);

            if (aLive && !bLive) return -1;
            if (!aLive && bLive) return 1;
            return aStart - bStart;
        })
        .slice(0, 30); // Increased slice limit to show more in the 7-day window
}

// ── Check if it's a "Regular" weekly contest ───────────────────
function isRegularContest(contest) {
    const name = (contest.name || '').toLowerCase();
    const platform = detectPlatform(contest);

    // LeetCode Weekly (Sunday 8:00 AM IST)
    if (platform === 'leetcode' && name.includes('weekly') && !name.includes('biweekly')) return true;

    // LeetCode Biweekly (Sunday 8:00 PM IST, alternate weeks)
    if (platform === 'leetcode' && name.includes('biweekly')) return true;

    // Codeforces typically holds rated rounds ~3 times/week (Div. 2, Div. 3, Div. 4, Educational, Global)
    if (platform === 'codeforces' && (name.includes('div') || name.includes('educational') || name.includes('global'))) return true;

    // CodeChef Starters (Wednesday 8:00 PM IST)
    // Supports both 'starters' and 'START125' style names
    if (platform === 'codechef' && (name.includes('starter') || name.includes('start'))) return true;

    return false;
}

// ── Apply active filter ────────────────────────────────────────
function applyFilter(contests) {
    let result = contests;
    if (activeFilter !== 'all') {
        result = result.filter(c => detectPlatform(c) === activeFilter);
    }
    if (activeTypeFilter === 'regular') {
        result = result.filter(c => isRegularContest(c));
    } else if (activeTypeFilter === 'other') {
        result = result.filter(c => !isRegularContest(c));
    }

    // Apply Settings Preferences Filter!
    const skillLevel = settings.skillLevel || 'all';
    const recommended = SKILL_PLATFORMS[skillLevel] || [];
    const prefPlats = settings.prefPlatforms || [];

    // Strict filtering: User only sees platforms that match their preferences
    if (skillLevel !== 'all' || prefPlats.length > 0) {
        result = result.filter(c => {
            const p = detectPlatform(c);
            const matchesSkill = skillLevel === 'all' || recommended.includes(p);
            const matchesPref = prefPlats.length === 0 || prefPlats.includes(p);
            return matchesSkill && matchesPref;
        });
    }

    return result;
}

// ── Schedule notifications for a contest ──────────────────────
function scheduleNotifications(contest) {
    const startMs = parseContestTime(contest.start_time).getTime();
    const endMs = getContestEndMs(contest);
    const now = Date.now();
    const isCurrentlyLive = startMs <= now && (endMs ? endMs > now : true);

    let notifyHour = true;
    if (settings.notifCustomHourCb !== undefined) notifyHour = settings.notifCustomHourCb;
    else if (settings.notif1h !== undefined) notifyHour = settings.notif1h;

    const customHour = settings.notifCustomHour || 1;

    let notifyCustom = true;
    if (settings.notifCustomCb !== undefined) notifyCustom = settings.notifCustomCb;
    else if (settings.notif10m !== undefined) notifyCustom = settings.notif10m;

    const customMin = settings.notifCustomMin || 10;

    const times = [];

    let notifyAtStart = true;
    if (settings.notifAtStart !== undefined) notifyAtStart = settings.notifAtStart;

    if (notifyAtStart) {
        times.push({ offset: 0, label: 'now' });
    }

    if (notifyHour) {
        const hLabel = customHour === 1 ? '1 hour' : `${customHour} hours`;
        times.push({ offset: customHour * 60 * 60 * 1000, label: hLabel });
    }
    if (notifyCustom) times.push({ offset: customMin * 60 * 1000, label: `${customMin} minutes` });

    times.forEach(({ offset, label }) => {
        const notifId = `${contest.url}_${offset}`;
        if (firedNotifs.includes(notifId)) return; // Already delivered

        const fireAt = startMs - offset;
        const delay = fireAt - now;

        const executeDelivery = () => {
            // Mark as fired immediately
            firedNotifs.push(notifId);
            if (firedNotifs.length > 500) firedNotifs.shift();
            localStorage.setItem('contestWidgetFired', JSON.stringify(firedNotifs));

            const messageTitle = offset === 0 ? `🔴 LIVE: ${contest.name}` : `⏰ ${contest.name}`;
            const messageBodyDesktop = offset === 0 ? `The contest has started right now! Good luck. 🚀` : `Starts in ${label}! Get ready. 🚀`;
            const messageBodyNtfy = offset === 0 ? `Contest is LIVE on ${contest.site || 'Platform'}! 🚀` : `Starts in ${label} on ${contest.site || 'Platform'}!`;

            if (window.electronAPI) {
                window.electronAPI.showNotification(
                    messageTitle,
                    messageBodyDesktop
                );
            }
            if (settings.ntfyTopic) {
                // Desktop is on, so we can send immediately if we want, 
                // but syncToNtfy already handles the "Offline" case by scheduling.
                // We'll keep this immediate one for when the PC is ON and the timer fires.
                const safeSite = (contest.site || 'contest').toLowerCase().replace(/\s+/g, '');
                fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfyTopic)}`, {
                    method: 'POST',
                    headers: {
                        'Title': messageTitle.replace(/[^\x00-\x7F]/g, ''), // Strip non-ASCII
                        'Tags': (offset === 0 ? 'rocket,' : 'alarm_clock,') + safeSite,
                        'Click': contest.url
                    },
                    body: messageBodyNtfy
                }).catch(e => console.error('ntfy err:', e));
            }
        };

        // --- NEW: Sync to ntfy.sh for OFFLINE support ---
        if (settings.ntfyTopic) {
            const syncId = `${contest.url}_${offset}_sync`;
            const fireAt = startMs - offset;
            const delayMs = fireAt - Date.now();

            // Only sync if not already synced and fire time is in the future (up to 48h)
            if (!syncedNotifs.includes(syncId) && delayMs > 5000 && delayMs < 48 * 3600 * 1000) {
                const safeSite = (contest.site || 'contest').toLowerCase().replace(/\s+/g, '');
                const messageTitle = offset === 0 ? `LIVE: ${contest.name}` : `Upcoming: ${contest.name}`;
                const messageBodyNtfy = offset === 0 ? `Contest is LIVE on ${contest.site || 'Platform'}! 🚀` : `Starts in ${label} on ${contest.site || 'Platform'}!`;

                fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfyTopic)}`, {
                    method: 'POST',
                    headers: {
                        'Title': messageTitle.replace(/[^\x00-\x7F]/g, ''),
                        'Tags': (offset === 0 ? 'rocket,' : 'alarm_clock,') + safeSite,
                        'Click': contest.url,
                        'Delay': Math.floor(delayMs / 1000) + 's' // ntfy scheduled delivery!
                    },
                    body: messageBodyNtfy
                }).then(res => {
                    if (res.ok) {
                        syncedNotifs.push(syncId);
                        if (syncedNotifs.length > 500) syncedNotifs.shift();
                        localStorage.setItem('contestWidgetSynced', JSON.stringify(syncedNotifs));
                        console.log(`Synced offline alert for ${contest.name} (${label})`);
                    }
                }).catch(e => console.error('ntfy sync err:', e));
            }
        }
        // -----------------------------------------------

        if (delay > 0 && delay < 2147483647) {
            const tid = setTimeout(executeDelivery, delay);
            scheduledNotifs.push(tid);
        } else if (delay <= 0) {
            // If we missed the alert, only fire it if it's the LIVE alert and the contest is actually still live,
            // OR if we missed any alert by less than 5 minutes.
            if ((offset === 0 && isCurrentlyLive) || delay > -300000) {
                executeDelivery();
            }
        }
    });
}

// ── Format countdown ──────────────────────────────────────────
function formatCountdown(ms, isLive = false) {
    if (ms <= 0 && !isLive) return 'Starting now!';
    if (ms <= 0 && isLive) return 'Ended';

    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);

    let timeStr = '';
    if (d > 0) timeStr = `${d}d ${h}h ${m}m`;
    else if (h > 0) timeStr = `${h}h ${m}m ${s}s`;
    else if (m > 0) timeStr = `${m}m ${s}s`;
    else timeStr = `${s}s`;

    return isLive ? `Ends in ${timeStr}` : timeStr;
}

function getCountdownClass(ms, isLive = false) {
    if (isLive && ms > 0) return 'live-timer text-danger';
    if (isLive && ms <= 0) return 'ended';
    if (ms <= 0) return 'urgent';
    if (ms < 10 * 60 * 1000) return 'urgent';
    if (ms < 60 * 60 * 1000) return 'warning';
    if (ms < 24 * 3600 * 1000) return 'normal';
    return 'upcoming';
}

// ── Local timezone (auto-detected) ───────────────────────────
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TZ_ABBR = (() => {
    try {
        const parts = Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone: LOCAL_TZ })
            .formatToParts(new Date());
        const tz = parts.find(p => p.type === 'timeZoneName');
        return tz ? tz.value : '';
    } catch { return ''; }
})();

// ── Format start time for display ─────────────────────────────
function formatStartTime(isoString) {
    const d = parseContestTime(isoString);
    if (isNaN(d)) return '—';
    const formatted = d.toLocaleString(undefined, {
        timeZone: LOCAL_TZ,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
    return TZ_ABBR ? `${formatted} ${TZ_ABBR}` : formatted;
}

// ── Format end time for display ───────────────────────────────
function formatEndTime(isoString) {
    const d = parseContestTime(isoString);
    if (isNaN(d)) return null;
    return d.toLocaleString(undefined, {
        timeZone: LOCAL_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

// ── Parse duration string or seconds into human label ──────────────
function formatDuration(raw) {
    if (!raw) return null;
    // Seconds (number or numeric string)
    const secs = Number(raw);
    if (!isNaN(secs) && secs > 0) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    }
    // "HH:MM:SS" string  e.g. "2:30:00"
    const match = String(raw).match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    }
    return null;
}

// ── Render contest cards ───────────────────────────────────────
function renderContests(contests) {
    // Clear existing countdown intervals
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};

    // Clear existing notification timers
    scheduledNotifs.forEach(clearTimeout);
    scheduledNotifs = [];

    if (contests.length > 0) {
        const titleEl = document.getElementById('miniNextName');
        if (titleEl) titleEl.textContent = contests[0].name;
        updateMiniWidgetTick(contests[0]);
    } else {
        const titleEl = document.getElementById('miniNextName');
        if (titleEl) titleEl.textContent = 'No upcoming contests';
        const timerEl = document.getElementById('miniNextTime');
        if (timerEl) timerEl.textContent = '--:--';
        if (miniWidgetTimer) clearInterval(miniWidgetTimer);
    }

    if (!contests.length) {
        contestList.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🔍</div>
        <strong>No contests found</strong>
        <p>Try a different filter or check back later.</p>
      </div>`;
        contestCount.textContent = '0 contests';
        return;
    }

    contestCount.textContent = `${contests.length} upcoming`;
    contestList.innerHTML = '';

    const skillLevel = settings.skillLevel || 'all';
    const recommended = SKILL_PLATFORMS[skillLevel] || [];
    const prefPlats = settings.prefPlatforms || [];

    const regularContests = contests.filter(c => isRegularContest(c));
    const otherContests = contests.filter(c => !isRegularContest(c));

    const createCard = (contest, idPrefix) => {
        const platform = detectPlatform(contest);
        const platInfo = PLATFORM_MAP[platform] || { name: platform, badge: 'badge-default' };
        const isRecommended = recommended.includes(platform) || (prefPlats.length && prefPlats.includes(platform));
        const isRegular = isRegularContest(contest);

        const startMs = parseContestTime(contest.start_time).getTime();
        const endMs = getContestEndMs(contest);
        const countdownId = `cd-${idPrefix}`;
        const isLiveInitial = startMs <= Date.now() && (endMs ? endMs > Date.now() : true);

        // Build card
        const card = document.createElement('div');
        card.className = 'contest-card' + (isRecommended ? ' recommended' : '') + (isRegular ? ' regular' : '') + (isLiveInitial ? ' live-card' : '');

        // Build time row
        const startLabel = formatStartTime(contest.start_time);
        const endLabel = endMs ? formatEndTime(new Date(endMs).toISOString()) : null;
        const durLabel = formatDuration(contest.duration)
            || (endMs ? formatDuration((endMs - startMs) / 1000) : null);

        const timeRow = endLabel && durLabel
            ? `<span class="start-time">🕐 ${escHtml(startLabel)}</span>
               <span class="dur-tag">⏱ ${escHtml(durLabel)} &nbsp;→&nbsp; ends ${escHtml(endLabel)} ${TZ_ABBR}</span>`
            : endLabel
                ? `<span class="start-time">🕐 ${escHtml(startLabel)}</span>
               <span class="dur-tag">ends ${escHtml(endLabel)} ${TZ_ABBR}</span>`
                : durLabel
                    ? `<span class="start-time">🕐 ${escHtml(startLabel)}</span>
               <span class="dur-tag">⏱ ${escHtml(durLabel)}</span>`
                    : `<span class="start-time">🕐 ${escHtml(startLabel)}</span>`;

        card.innerHTML = `
      <div class="card-top">
        <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;" id="badges-${idPrefix}">
            <span class="live-badge recommended-badge" style="display: ${isLiveInitial ? 'inline-block' : 'none'}; background: var(--danger); color: #fff; animation: pulse 1.5s infinite;">🔴 LIVE</span>
            ${isRegular ? '<span class="recommended-badge" style="background: var(--success); color: #000;">Regular</span>' : ''}
            ${isRecommended ? '<span class="recommended-badge">★ Recommended</span>' : ''}
            <span class="platform-badge ${platInfo.badge}">${platInfo.name}</span>
        </div>
      </div>
      <div class="contest-name" title="${escHtml(contest.name)}" style="margin-top: 6px;">
          ${isRegular ? '<span class="regular-icon">🗓️</span>' : ''}
          ${truncate(escHtml(contest.name), 42)}
      </div>
      <div class="card-time" style="margin-top: 4px;">
        ${timeRow}
      </div>
      <div class="card-bottom">
        <span class="countdown ${getCountdownClass(isLiveInitial ? (endMs ? endMs - Date.now() : 0) : startMs - Date.now(), isLiveInitial)}" id="${countdownId}">
          ${formatCountdown(isLiveInitial ? (endMs ? endMs - Date.now() : 0) : startMs - Date.now(), isLiveInitial)}
        </span>
        <button class="join-btn" data-url="${escHtml(contest.url)}">Join →</button>
      </div>
    `;

        // Join button handler
        card.querySelector('.join-btn').addEventListener('click', (e) => {
            const url = e.target.getAttribute('data-url');
            if (window.electronAPI) window.electronAPI.openURL(url);
        });

        // Live countdown
        const countdownEl = card.querySelector(`#${countdownId}`);
        const liveBadgeEl = card.querySelector('.live-badge');
        countdownIntervals[countdownId] = setInterval(() => {
            const now = Date.now();

            // Instantly remove from list upon ending
            if (startMs <= now && endMs && endMs <= now) {
                card.remove();
                clearInterval(countdownIntervals[countdownId]);
                delete countdownIntervals[countdownId];
                return;
            }

            const isLive = startMs <= now && (endMs ? endMs > now : true);
            const remaining = isLive ? (endMs ? endMs - now : 0) : startMs - now;

            if (countdownEl) {
                countdownEl.textContent = formatCountdown(remaining, isLive);
                countdownEl.className = `countdown ${getCountdownClass(remaining, isLive)}`;
            }

            if (isLive) {
                card.classList.add('live-card');
                if (liveBadgeEl) liveBadgeEl.style.display = 'inline-block';
            } else {
                card.classList.remove('live-card');
                if (liveBadgeEl) liveBadgeEl.style.display = 'none';
            }
        }, 1000);

        // Schedule notifications
        scheduleNotifications(contest);

        return card;
    };

    if (regularContests.length > 0) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = 'Regular / Weekly Contests';
        contestList.appendChild(header);

        regularContests.forEach((contest, idx) => {
            contestList.appendChild(createCard(contest, 'reg-' + idx));
        });
    }

    if (otherContests.length > 0) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = 'Other Contests';
        contestList.appendChild(header);

        otherContests.forEach((contest, idx) => {
            contestList.appendChild(createCard(contest, 'oth-' + idx));
        });
    }
}

// ── Main refresh ────────────────────────────────────────────────
async function refresh(isAuto = false) {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.classList.add('spinning');

    // Only force recreate loading state if it is a manual refresh
    if (!isAuto) {
        contestList.innerHTML = `
          <div class="loading-state" id="loadingState">
            <div class="spinner"></div>
            <p>Fetching contests…</p>
          </div>`;
    }

    try {
        const raw = await fetchContests();
        allContests = processContests(raw);
        filteredContests = applyFilter(allContests);
        renderContests(filteredContests);
    } catch (err) {
        contestList.innerHTML = `
      <div class="empty-state">
        <div class="emoji">⚠️</div>
        <strong>Failed to load contests</strong>
        <p>${escHtml(err.message)}</p>
      </div>`;
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('spinning');
    }

    lastRefresh.textContent = `Updated ${new Date().toLocaleTimeString(undefined, { timeZone: LOCAL_TZ, hour: '2-digit', minute: '2-digit', hour12: true })} ${TZ_ABBR}`;
}

// ── Auto-refresh every 60s ─────────────────────────────────────
function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh(true), 60 * 1000);
}

// ── Filter pills ───────────────────────────────────────────────
filterBar.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    filterBar.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeFilter = pill.dataset.platform;
    filteredContests = applyFilter(allContests);
    renderContests(filteredContests);
});

typeFilterBar.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    typeFilterBar.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeTypeFilter = pill.dataset.type;
    filteredContests = applyFilter(allContests);
    renderContests(filteredContests);
});

// ── Settings ───────────────────────────────────────────────────
function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem('contestWidgetSettings') || '{}');
    } catch { return {}; }
}

function saveSettings() {
    const prefPlatforms = [...document.querySelectorAll('.pref-platform:checked')].map(c => c.value);
    const skillRadio = document.querySelector('input[name="skillLevel"]:checked');
    const skillLevel = skillRadio ? skillRadio.value : 'all';
    const notifCustomHourCb = document.getElementById('notifCustomHourCb').checked;
    const notifCustomHour = parseInt(document.getElementById('notifCustomHour').value, 10) || 1;
    const notifCustomCb = document.getElementById('notifCustomCb').checked;
    const notifCustomMin = parseInt(document.getElementById('notifCustomMin').value, 10) || 10;
    const notifAtStart = document.getElementById('notifAtStart').checked;
    const ntfyTopic = document.getElementById('ntfyTopic').value.trim();
    const autostart = document.getElementById('autostartCb').checked;
    const skipTaskbar = document.getElementById('skipTaskbarCb').checked;

    settings = { prefPlatforms, skillLevel, notifCustomHourCb, notifCustomHour, notifCustomCb, notifCustomMin, notifAtStart, ntfyTopic, autostart, skipTaskbar };
    localStorage.setItem('contestWidgetSettings', JSON.stringify(settings));
    
    // Apply system settings immediately
    if (window.electronAPI) {
        window.electronAPI.setAutostart(autostart);
        window.electronAPI.setSkipTaskbar(skipTaskbar);
    }

    closeSettingsPanel();
    refresh();
}

function openSettingsPanel() {
    // Populate from saved settings
    document.querySelectorAll('.pref-platform').forEach(cb => {
        cb.checked = (settings.prefPlatforms || []).includes(cb.value);
    });
    const skillRadio = document.querySelector(`input[name="skillLevel"][value="${settings.skillLevel || 'all'}"]`);
    if (skillRadio) skillRadio.checked = true;

    let customHourCbChecked = true;
    if (settings.notifCustomHourCb !== undefined) customHourCbChecked = settings.notifCustomHourCb;
    else if (settings.notif1h !== undefined) customHourCbChecked = settings.notif1h;
    document.getElementById('notifCustomHourCb').checked = customHourCbChecked;
    document.getElementById('notifCustomHour').value = settings.notifCustomHour || 1;

    let customCbChecked = true;
    if (settings.notifCustomCb !== undefined) customCbChecked = settings.notifCustomCb;
    else if (settings.notif10m !== undefined) customCbChecked = settings.notif10m;
    document.getElementById('notifCustomCb').checked = customCbChecked;
    document.getElementById('notifCustomMin').value = settings.notifCustomMin || 10;

    document.getElementById('notifAtStart').checked = settings.notifAtStart !== false;

    document.getElementById('ntfyTopic').value = settings.ntfyTopic || '';
    
    document.getElementById('autostartCb').checked = settings.autostart === true;
    document.getElementById('skipTaskbarCb').checked = settings.skipTaskbar !== false;

    settingsPanel.classList.add('open');
}

function closeSettingsPanel() {
    settingsPanel.classList.remove('open');
}

function openAboutPanel() {
    closeSettingsPanel();
    aboutPanel.classList.add('open');
}

function closeAboutPanel() {
    aboutPanel.classList.remove('open');
}

document.getElementById('settingsBtn').addEventListener('click', () => {
    closeAboutPanel();
    openSettingsPanel();
});
document.getElementById('aboutBtn').addEventListener('click', openAboutPanel);
document.getElementById('closeAbout').addEventListener('click', closeAboutPanel);
document.getElementById('closeSettings').addEventListener('click', closeSettingsPanel);
document.getElementById('saveSettings').addEventListener('click', saveSettings);





// ── Window controls ────────────────────────────────────────────
document.getElementById('minimizeBtn').addEventListener('click', () => {
    setMiniMode(true);
});

document.getElementById('maximizeBtn').addEventListener('click', () => {
    if (window.electronAPI) {
        window.electronAPI.maximizeWindow();
        const btn = document.getElementById('maximizeBtn');
        const isMax = btn.textContent === '❐';
        btn.textContent = isMax ? '□' : '❐';
        btn.title = isMax ? 'Maximize' : 'Restore';
    }
});

document.getElementById('miniExpandBtn').addEventListener('click', () => {
    setMiniMode(false);
});

document.getElementById('closeBtn').addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.closeWindow();
});

document.getElementById('refreshBtn').addEventListener('click', () => refresh(false));

// ── Helpers ────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function bootSystemSettings() {
    if (!window.electronAPI) return;
    
    // Apply autostart (default true if not set)
    window.electronAPI.setAutostart(settings.autostart !== false);
    
    // Apply skipTaskbar (default true if not set)
    window.electronAPI.setSkipTaskbar(settings.skipTaskbar !== false);
}

// ── Boot ───────────────────────────────────────────────────────
setMiniMode(true);
bootSystemSettings();
refresh();
startAutoRefresh();
