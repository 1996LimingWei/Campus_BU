import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { ChatOpenAI } from "@langchain/openai";
import * as BrowserTools from './browser_tools';
import { AGENT_CONFIG } from './config';

/* ── State ───────────────────────────────────────────────── */

const AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => (x || []).concat(y || []),
        default: () => [],
    }),
    sender: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "user",
    }),
    userId: Annotation<string>(),
    steps: Annotation<any[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    duration: Annotation<string>({
        reducer: (x, y) => y || x,
        default: () => "2 Hours",
    }),
    numUsers: Annotation<string>({
        reducer: (x, y) => y || x,
        default: () => "2",
    }),
    targetDate: Annotation<string>({
        reducer: (x, y) => y || x,
        default: () => "",
    }),
    targetTime: Annotation<string>({
        reducer: (x, y) => y || x,
        default: () => "",
    }),
    targetRoomId: Annotation<string>({
        reducer: (x, y) => y || x,
        default: () => "",
    }),
});

/* ── HKBU Booking System URLs ────────────────────────────── */

/**
 * REAL HKBU booking URLs — these go directly to SSO → booking grid.
 * Found from: https://library.hkbu.edu.hk/using-the-library/facilities/room-bookings/
 * Each room type page has a "Book a Room" link to sys01.lib.hkbu.edu.hk
 */
const BOOKING_URLS: Record<string, string> = {
    'Group Study Rooms': 'https://sys01.lib.hkbu.edu.hk/room_bookings/1/',
    'Multipurpose Rooms': 'https://sys01.lib.hkbu.edu.hk/room_bookings/2/',  // likely /2/
    'Individual Study Rooms': 'https://sys01.lib.hkbu.edu.hk/room_bookings/3/',  // likely /3/
    'Postgraduate Study Rooms': 'https://sys01.lib.hkbu.edu.hk/room_bookings/4/',  // likely /4/
    // AAB/FSC rooms use a different system:
    // 'AAB Rooms': 'https://cvfbs.hkbu.edu.hk/Booking/AABSchedule.aspx',
    // 'FSC Rooms': 'https://cvfbs.hkbu.edu.hk/Booking/FSCSchedule.aspx',
};

const DEFAULT_BOOKING_URL = 'https://sys01.lib.hkbu.edu.hk/room_bookings/1/';

const CRUSH_COOKIES_SNIPPET = `
async function crushCookies() {
    const keywords = ['accept', 'agree', 'got it', 'understand', 'ok', '同意', '好的', '接受', '明白', '✕', 'close', 'accept all'];
    
    function solve(root) {
        if (!root) return;
        // Broaden target tags and include anything with an onclick
        const elements = root.querySelectorAll('button, a, span, div, input, [role="button"], [aria-label], [onclick]');
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            const text = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').toLowerCase().trim();
            
            // Check for exact keywords or inclusion
            if (keywords.some(k => text === k || text === (k + ' all') || (text.length < 20 && text.includes(k)))) {
                const style = window.getComputedStyle(el);
                const isOverlay = style.position === 'fixed' || style.position === 'sticky' || parseInt(style.zIndex) > 50 || el.closest('[style*="fixed"], [style*="absolute"], [style*="sticky"]');
                
                // If it looks like a button and is in an overlay (or just visible)
                if (isOverlay || style.cursor === 'pointer' || el.tagName === 'BUTTON' || el.tagName === 'A') {
                    // Forceful click
                    el.click();
                    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    el.dispatchEvent(new PointerEvent('click', { bubbles: true }));
                    console.log('Cookie Crusher: Aggressively clicked', text);
                    
                    // After clicking, hide the parent overlay just in case it doesn't close
                    const container = el.closest('[style*="fixed"], [style*="absolute"], [style*="sticky"]') || el.parentElement;
                    if (container && (window.getComputedStyle(container).position === 'fixed' || parseInt(window.getComputedStyle(container).zIndex) > 50)) {
                        container.style.display = 'none';
                        container.style.opacity = '0';
                        container.style.pointerEvents = 'none';
                    }
                    return true;
                }
            }
            if (el.shadowRoot) solve(el.shadowRoot);
        }
        return false;
    }

    // Polling loop: Run more times to be sure
    for (let j = 0; j < 5; j++) {
        const found = solve(document);
        if (found) {
            await new Promise(r => setTimeout(r, 800)); // Longer stability pause
        }
        await new Promise(r => setTimeout(r, 400));
    }

    // Nuclear Option: Find any remaining fixed elements containing "cookie" or "privacy" and hide them
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' && parseInt(style.zIndex) > 50) {
            const inner = (el.innerText || '').toLowerCase();
            if (inner.includes('cookie') || inner.includes('privacy') || inner.includes('隐私') || inner.includes('政策')) {
                el.style.display = 'none';
                el.style.pointerEvents = 'none';
                console.log('Cookie Crusher: Nuked suspected banner container');
            }
        }
    }
}
`;

/* ── Booking Grid Scanner Script ─────────────────────────── */

/**
 * Scans the booking grid table on the HKBU library page.
 * The grid has:
 * - Header row with room names (e.g., "Group Study Room 1 (6 seats)")
 * - Data rows with Time column + Available/Reserved cells
 * Returns structured slot data.
 */
const CSS_SHIELD_SNIPPET = `
(function() {
    var style = document.createElement('style');
    style.innerHTML = \`
        [style*="fixed"], [style*="absolute"], [style*="sticky"], .overlay, .cookie, .banner, .modal, #duo_iframe_container {
            /* If it contains cookie-related text, nuke it proactively */
        }
        /* Aggressive targeting */
        [id*="cookie"], [class*="cookie"], [id*="banner"], [class*="banner"], [id*="overlay"], [class*="overlay"] {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
    \`;
    document.head.appendChild(style);
    console.log('CSS Shield: Active');
})();
`;

const SCAN_SLOTS_SCRIPT = `
(async function() {
    try {
        // 1. Proactive CSS Shield
    ${CSS_SHIELD_SNIPPET}

    // 2. Dismiss overlays remaining (Robust Persistence)
    ${CRUSH_COOKIES_SNIPPET}
    await crushCookies();
    
    var slots = [];
    var rooms = [];
    var dateText = '';
    var debug = { rows: 0, cells: 0, timeMatches: 0, bestScore: 0, tablesFound: 0 };
    var diagTables = [];

    var tables = Array.from(document.querySelectorAll('table'));
    debug.tablesFound = tables.length;
    var targetTable = null;
    var bestScore = -100;

    tables.forEach(function(tab, idx) {
        var score = 0;
        var html = tab.innerHTML.toLowerCase();
        var text = (tab.innerText || '').trim();
        var rowElems = tab.querySelectorAll('tr');
        var colCount = rowElems[0] ? rowElems[0].querySelectorAll('th, td').length : 0;

        // Weighted Scoring Logic
        if (rowElems.length > 10) score += 15; 
        if (colCount > 2) score += 5;
        if (html.includes('available')) score += 15;
        if (html.includes('reserved')) score += 5;
        if (text.match(/\\d{1,2}:\\d{2}/)) score += 20; 
        if (text.includes('Room') || text.includes('Study') || text.includes('房') || text.includes('位')) score += 15;
        
        // Calendar penalties (7 columns, Su/Mo/Tu headers)
        if (colCount === 7 && rowElems.length <= 8) score -= 40;
        if (text.includes('Su') && text.includes('Mo') && text.includes('Tu')) score -= 30;

        diagTables.push({ index: idx, score: score, rows: rowElems.length, snippet: text.substring(0, 100).replace(/\\n/g, ' ') });
        
        if (score > bestScore) {
            bestScore = score;
            targetTable = tab;
        }
    });

    // 1. Iframe Detection: If the main document lacks a good grid, look for iframes
    var allIframes = Array.from(document.querySelectorAll('iframe'));
    // 1. Check for "Closed" or "Holiday" notices before scoring tables
    var pageLower = (document.body.innerText || '').toLowerCase();
    if (pageLower.includes('closed') || pageLower.includes('holiday') || pageLower.includes('lunar new year') || pageLower.includes('公眾假期') || pageLower.includes('休館')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'BOOKING_SLOTS',
            payload: { error: 'LIBRARY_CLOSED', message: '抱歉，图书馆在当前时段已关闭（可能是节假日或非开放时间）。', preview: pageLower.substring(0, 200) }
        }));
        return;
    }

    if (bestScore < 15) {
        for (var f = 0; f < allIframes.length; f++) {
            var src = allIframes[f].src || '';
            // If the iframe source contains room_bookings, it's likely our target
            if (src.includes('room_bookings')) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'BOOKING_SLOTS',
                    payload: { followUrl: src, message: 'Grid is in iframe, requesting leap' }
                }));
                return;
            }
        }
    }

    if (!targetTable || bestScore < 10) {
        var pageText = (document.body.innerText || '').trim().substring(0, 1000);
        var iframeSrcs = allIframes.map(function(i) { return i.src; });
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'BOOKING_SLOTS',
            payload: { 
                error: 'Grid table not found (Score too low)', 
                diag: diagTables,
                debug: {
                    tablesFound: tables.length,
                    iframesFound: allIframes.length,
                    iframeSrcs: iframeSrcs,
                    pagePreview: pageText,
                    url: window.location.href
                }
            }
        }));
        return;
    }

    // Try to find the date header
    var allElements = document.querySelectorAll('*');
    for (var k = 0; k < allElements.length; k++) {
        var txt = (allElements[k].innerText || '').trim();
        if (txt.match(/\\d{1,2}\\s+[A-Z][a-z]+\\s+\\d{4}/) || txt.match(/[A-Z][a-z]+\\s+\\d{1,2},\\s+\\d{4}/)) {
            if (txt.length < 50) {
                dateText = txt.split('\\n')[0];
                break;
            }
        }
    }

    var rows = targetTable.querySelectorAll('tr');
    debug.rows = rows.length;

    rows.forEach(function(row) {
        var cells = row.querySelectorAll('th, td');
        // Look for room headers in every row to handle top/bottom positions
        var potentialRooms = [];
        cells.forEach(function(c, idx) {
            var text = (c.innerText || '').trim();
            if (text.includes('Room') || text.includes('Study') || text.includes('seats') || text.includes('房') || text.includes('位')) {
                potentialRooms.push({ index: idx, name: text });
            }
        });
        if (potentialRooms.length >= 2) rooms = potentialRooms;

        // Scan for slots in this row
        if (cells.length > 1) {
            var rowText = row.innerText || '';
            var timeMatch = rowText.match(/(\\d{1,2}:\\d{2})/);
            if (timeMatch) {
                debug.timeMatches++;
                var timeText = timeMatch[1];

                if (rooms.length > 0) {
                    rooms.forEach(function(room) {
                        var cell = cells[room.index];
                        if (!cell) return;

                        var html = cell.innerHTML.toLowerCase();
                        var text = cell.innerText.toLowerCase();
                        var title = (cell.getAttribute('title') || '').toLowerCase();
                        var alt = '';
                        var imgs = cell.querySelectorAll('img');
                        imgs.forEach(function(img) { alt += (img.getAttribute('alt') || '').toLowerCase(); });

                        var isAvailable = text.includes('available') || title.includes('available') || alt.includes('available') || html.includes('available') || text.includes('可用') || text.includes('空閒');
                        var isReserved = text.includes('reserved') || title.includes('reserved') || alt.includes('reserved') || html.includes('reserved') || text.includes('已預約') || text.includes('佔用');

                        if (isAvailable || isReserved) {
                            var link = cell.querySelector('a');
                            var bookingUrl = link ? link.href : '';
                            
                            // Extract Numeric Room ID from href: /book?room=6&date=...
                            var roomId = '';
                            if (bookingUrl) {
                                var m = bookingUrl.match(/room=(\d+)/);
                                if (m) roomId = m[1];
                            }

                            slots.push({
                                time: timeText,
                                room: room.name,
                                roomId: roomId,
                                status: isAvailable ? 'available' : 'reserved',
                                bookingUrl: bookingUrl
                            });
                        }
                    });
                } else {
                    // Fallback: just check all cells in the row
                    for (var c = 1; c < cells.length; c++) {
                        var cell = cells[c];
                        var html = cell.innerHTML.toLowerCase();
                        if (html.includes('available') || html.includes('reserved')) {
                            var isAvailable = html.includes('available');
                            var link = cell.querySelector('a');
                            var bookingUrl = link ? link.href : '';
                            slots.push({
                                time: timeText,
                                room: 'Room ' + c,
                                status: isAvailable ? 'available' : 'reserved',
                                bookingUrl: bookingUrl
                            });
                        }
                    }
                }
            }
        }
    });

    window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'BOOKING_SLOTS',
        payload: {
            date: dateText,
            rooms: rooms.map(function(r) { return r.name; }),
            slots: slots,
            totalAvailable: slots.filter(function(s) { return s.status === 'available'; }).length,
            debug: debug,
            diag: diagTables
        }
    }));
    } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'BOOKING_SLOTS',
            payload: { error: 'Scanner crashed: ' + err.message, stack: err.stack }
        }));
    }
})();
`;

/* ── Click Slot Script ───────────────────────────────────── */

const CLICK_SLOT_SCRIPT = (time: string, roomIndex: number, bookingUrl?: string) => `
(async function() {
    try {
    // Dismiss overlays
    ${CRUSH_COOKIES_SNIPPET}
    await crushCookies();

    var targetTime = "${time}";
    var roomCol = ${roomIndex}; 
    var directUrl = "${bookingUrl || ''}";
    var clicked = false;
    var msg = '';

    // Priority 1: Direct Navigation if we have the URL from the scan
    if (directUrl && directUrl.length > 10) {
        window.location.href = directUrl;
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CLICK_SLOT_RESULT',
            payload: { success: true, message: 'Direct navigation to: ' + directUrl }
        }));
        return;
    }

    var rows = document.querySelectorAll('table tr');
    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].querySelectorAll('td, th');
        if (cells.length < 2) continue;

        var timeText = (cells[0].innerText || '').trim();
        if (timeText === targetTime) {
            // Found the time row, click the room cell
            var targetCell = cells[roomCol];
            if (targetCell) {
                var link = targetCell.querySelector('a') || targetCell;
                var cellText = (targetCell.innerText || '').trim().toLowerCase();
                var isAvail = cellText.includes('available') || cellText.includes('可用') || cellText.includes('空閒') || targetCell.innerHTML.toLowerCase().includes('available');

                if (isAvail) {
                    // Force same window navigation
                    if (link.tagName === 'A') link.target = "_self";
                    var oldOpen = window.open;
                    window.open = function(url) { window.location.href = url; return null; };

                    link.click();
                    setTimeout(function() { window.open = oldOpen; }, 500);

                    clicked = true;
                    msg = 'Clicked slot: ' + targetTime + ' at column ' + roomCol;
                } else {
                    // Fallback: search for ANY link in the page that might be our slot
                    // Often these links have "book" and the date in the URL
                    var allLinks = Array.from(document.querySelectorAll('a[href*="book"]'));
                    var backupLink = allLinks.find(function(a) {
                        var href = a.href.toLowerCase();
                        return href.includes('date=') && (href.includes('stime=') || href.includes('time='));
                    });
                    if (backupLink) {
                        backupLink.target = "_self";
                        backupLink.click();
                        clicked = true;
                        msg = 'Clicked via backup link fallback';
                    } else {
                        msg = 'Slot not available and no fallback found';
                    }
                }
            }
            break;
        }
    }

    if (!clicked && !msg) msg = 'Time row not found: ' + targetTime;

    window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CLICK_SLOT_RESULT',
        payload: { success: clicked, message: msg }
    }));
    } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CLICK_SLOT_RESULT',
            payload: { success: false, message: 'Click crashed: ' + err.message }
        }));
    }
})();
`;

const SUBMIT_BOOKING_SCRIPT = (duration: string, numUsers: string) => `
(async function() {
    try {
        // Dismiss overlays
        ${CRUSH_COOKIES_SNIPPET}
        await crushCookies();

        // 0. Ensure we are NOT on the grid page
        var pageText = document.body.innerText || '';
        if (pageText.includes('Step 1:') || pageText.includes('Select the date')) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUBMIT_TRIGGERED', payload: { success: false, message: 'Still on grid page, form not found' } }));
            return;
        }

        // Handle potential alerts
        window.alert = function(msg) { console.log('Alert suppressed:', msg); return true; };
        window.confirm = function(msg) { return true; };

        // 1. Fill Duration (Targeting name="du" based on payload)
        var dSelect = document.querySelector('select[name="du"], select[name*="duration"]');
        if (dSelect) {
            var opts = Array.from(dSelect.options);
            var target = "${duration}".toLowerCase();
            // Enhanced Matching: Case-insensitive search
            var match = opts.find(function(o) { 
                var t = (o.text || "").toLowerCase();
                return t.includes(target) || (target.includes("1") && (t.includes("60") || t.includes("1.0"))); 
            });

            if (!match && target.includes("1")) {
                // If "1 Hour" label matching failed, try numeric value fallback (HKBU: 1 hour = 2 blocks)
                match = opts.find(function(o) { return o.value === "2" || o.value === "1"; });
            }
            if (!match) match = opts[opts.length - 1]; 
            
            if (match) {
                console.log('Selecting Duration:', match.text, 'Value:', match.value);
                dSelect.value = match.value;
                dSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // 2. Fill Users (Targeting name="nop" based on payload)
        var uSelect = document.querySelector('select[name="nop"], select[name*="user"]');
        if (uSelect) {
            var opts2 = Array.from(uSelect.options);
            var match2 = opts2.find(function(o) { return o.text.includes("${numUsers}") || o.value === "${numUsers}"; }) || opts2[opts2.length - 1];
            if (match2) {
                uSelect.value = match2.value;
                uSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // 3. Ensure CSRF Token exists (for logging/debug)
        var csrf = document.querySelector('input[name="csrf_token"]');
        if (!csrf) {
            console.warn('CSRF token input not found, submission might fail.');
        }

        // 4. Check for any "Terms" or "Agreement" checkboxes
        var terms = document.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < terms.length; i++) {
            var txt = (terms[i].parentElement.innerText || '').toLowerCase();
            if (txt.includes('agree') || txt.includes('term') || txt.includes('policy') || txt.includes('同意') || txt.includes('守則')) {
                if (!terms[i].checked) terms[i].click();
            }
        }

        // 5. Click Submit (Broadened for HKBU)
        var submitBtn = document.querySelector('input[type="submit"], button[type="submit"], .btn-primary, #btnSubmit, #btnConfirm, input[value="Submit"]');
        if (!submitBtn) {
            var buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
            submitBtn = buttons.find(function(b) {
                var val = (b.innerText || b.value || '').trim().toLowerCase();
                return val.includes('submit') || val.includes('confirm') || val.includes('确定') || val.includes('確定') || val.includes('提交');
            });
        }

        if (submitBtn) {
            submitBtn.click();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUBMIT_TRIGGERED', payload: { success: true, hasCsrf: !!csrf } }));
        } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUBMIT_TRIGGERED', payload: { success: false, message: 'Submit button not found' } }));
        }
    } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUBMIT_TRIGGERED', payload: { success: false, error: err.message, stack: err.stack } }));
    }
})();
`;

/* ── Calendar Date Click Script ──────────────────────────── */

const CLICK_DATE_SCRIPT = (day: number, monthOffset: number = 0) => `
(async function() {
    try {
        // Dismiss overlays
    ${CRUSH_COOKIES_SNIPPET}
    await crushCookies();

    var targetDay = ${day};
    var monthOffset = ${monthOffset};
    var clicked = false;

    // 1. Handle Month Navigation if needed
    if (monthOffset !== 0) {
        var btnSelector = monthOffset > 0 ? '.next, .next-month, [aria-label*="Next"]' : '.prev, .prev-month, [aria-label*="Prev"]';
        var nextBtn = document.querySelector(btnSelector);
        if (nextBtn) {
            nextBtn.click();
            // Wait for calendar to re-render
            await new Promise(r => setTimeout(r, 1000));
            var links = document.querySelectorAll('a, td, span');
            for (var i = 0; i < links.length; i++) {
                var text = (links[i].innerText || '').trim();
                if (text === String(targetDay) && (links[i].closest('table') || links[i].className.includes('day'))) {
                    if (links[i].className.includes('other') || links[i].className.includes('muted')) continue;
                    links[i].click();
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DATE_CLICK', payload: { success: true, day: targetDay, navigated: true } }));
                    return;
                }
            }
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DATE_CLICK', payload: { success: false, message: 'Day not found after nav' } }));
            return;
        }
    }

    // 2. Find and click the day
    var links = document.querySelectorAll('a, td, span');
    for (var i = 0; i < links.length; i++) {
        var text = (links[i].innerText || '').trim();
        // Match just the day number in a calendar-like structure
        if (text === String(targetDay) && (links[i].closest('table') || links[i].className.includes('day'))) {
            // Avoid clicking "muted" or "other-month" days if possible
            if (links[i].className.includes('other') || links[i].className.includes('muted')) continue;

            links[i].click();
            clicked = true;
            break;
        }
    }

    window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'DATE_CLICK',
        payload: { success: clicked, day: targetDay, navigated: monthOffset !== 0 }
    }));
    } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DATE_CLICK',
            payload: { success: false, message: 'Date click crashed: ' + err.message }
        }));
    }
})();
`;

/* ── Chat System Prompt ──────────────────────────────────── */

function buildChatPrompt(): string {
    const now = new Date();
    // Use Hong Kong Time (UTC+8) for consistent library booking logic
    const timezone = 'Asia/Hong_Kong';
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });
    const pts = fmt.formatToParts(now);
    const yStr = pts.find(p => p.type === 'year')?.value || '2026';
    const mStr = pts.find(p => p.type === 'month')?.value || '02';
    const dStr = pts.find(p => p.type === 'day')?.value || '19';
    const dayName = pts.find(p => p.type === 'weekday')?.value;
    const ymd = `${yStr}${mStr}${dStr}`;

    return `You are "HKCampus Assistant" (浸大领航员), the exclusive AI assistant for Hong Kong Baptist University (HKBU) students. You help students book library study rooms FULLY AUTOMATICALLY.
STRICT RULE: Respond ONLY with a JSON object.

## Your Persona & Tone:
1. You are a friendly, knowledgeable, and enthusiastic senior student at HKBU.
2. You speak naturally, concisely, and use emojis where appropriate.
3. Your primary language for replies is Chinese, but you can understand English perfectly. You may mix in common HKBU English slang (e.g., "Reg course", "AAB", "Main Lib", "Canteen").

## Core Rules & Boundaries:
1. EXCLUSIVE DOMAIN: You ONLY answer questions related to HKBU campus life, academic affairs, campus facilities (library, canteens, classrooms, dorms), student activities, and the HKCampus app.
2. REFUSAL POLICY: If a user asks a question completely unrelated to HKBU or university life (e.g., "Write a script", "Who is the US president", "Explain physics"), you MUST politely decline and steer the conversation back to campus topics.
   Example: "哈哈，这个问题超纲啦！作为你的专属校园助手，我更擅长带你吃遍浸大、找空闲课室或者抢图书馆座位哦。校园生活有什么需要帮忙的吗？🎓"
3. HONESTY: Do not hallucinate facts. If you do not know the answer, use a tool to find it.

## Reference Time:
Current Date: ${yStr}-${mStr}-${dStr} (${dayName})
Current Year: ${yStr}

## GUIDELINES
1. ACCURATE DATE: Use the Reference Time above as "Today". 
   - Date format for URL: YYYYMMDD (e.g. today is ${ymd}).
   - Relative Dates: Tomorrow is ${ymd.substring(0, 6)}${String(parseInt(dStr) + 1).padStart(2, '0')} (approx, Agent will calculate precisely).
2. LOGIN FIRST: If not logged in, use start_manual_login.
- SSO has Duo MFA — user needs to approve on phone after you enter credentials

## Flow:

CASE A — User says "我要订位子" or "帮我订图书馆":
1. reply: "好的！我来帮你预订。我现在为你打开 HKBU 登录页面，请手动完成登录和 Duo 验证，完成后我会自动继续下一步。"
2. action: { "tool": "start_manual_login", "input": { "roomType": "Group Study Rooms" } }

After successful login(confirmed by Agent automatically):
  Agent pushes: "✅ 登录成功！你想预订哪一天的座位？"
  Agent provides quick replies: ["今天", "明天", "后天"]

When user picks a date:
action: { "tool": "scan_date", "input": { "date": "..." } }
reply: "⏳ 正在查询 {date} 的可用时段..."

When user picks a slot from results:
action: { "tool": "book_slot", "input": { "slotInfo": "..." } }
reply: "⏳ 正在为您提交预订..."

CASE B — User gives specifics("帮我订明天下午3点AAB的位子, 1小时, 4个人"):
1. thought: "用户提供了完整信息。我需要通过工具输入来确保时长和人数被保存在状态中。"
2. reply: "没问题！已为您锁定：明日下午3点，1小时位子（4人）。我正为您秒杀中..."
3. action: {
    "tool": "start_manual_login",
    "input": {
        "date": "...",
        "time": "15:00",
        "duration": "1 Hour",
        "numUsers": "4",
        "roomType": "..."
    }
}

STRICT RULE on State Persistence:
Whenever you output an action (scan_date, book_slot, fast_locate, start_manual_login), you MUST include "duration" and "numUsers" in the "input" object if the user has mentioned them ANYWHERE in the conversation.
Current Defaults: duration="2 Hours", numUsers="2".
If user says "1小时", ALWAYS include "duration": "1 Hour" in every subsequent action.

CASE C — User says "定位"(Fast Locate):
1. thought: "用户使用了定位指令。我需要根据房间、日期和时间计算直达 URL。"
2. action: { "tool": "fast_locate", "input": { "url": "DYNAMIC_URL" } }
- STIME Calculation: 9 AM = 9, 10 AM = 10, ..., 1 PM = 13, 10 PM = 22.
- ROOM ID Mapping (CRITICAL): 
  * GSR 1=6, 2=5, 3=4, 4=3, 5=2, 6=1
  * Individual Study Room 1=18, 2=19, 3=20, 4=21, 5=22, 6=23, 7=24, 8=25
- DURATION (du) Calculation (CRITICAL):
  * du = Hours * 2 (e.g., 1 Hour = du=2, 2 Hours = du=4)
- URL Pattern: https://sys01.lib.hkbu.edu.hk/room_bookings/1/book?room=ID&date=YYYYMMDD&stime=H&du=D

## Combined Quick Replies:
When info like Duration or Users is missing, provide combined options instead of asking twice:
-["2小时 / 2人", "2小时 / 4人", "3小时 / 2人", "3小时 / 4人"]

## Correct JSON Format Example:
{
    "thought": "用户想要订位子，我需要引导其手动登录。",
        "reply": "好的，这就为您打开登录页面，请手动完成登录和 Duo 验证。",
            "action": {
        "tool": "start_manual_login",
            "input": { "roomType": "Group Study Rooms" }
    },
    "quickReplies": []
}

STRICT RULE: YOUR ENTIRE RESPONSE MUST BE A SINGLE JSON OBJECT.NO MARKDOWN, NO PREFIX, NO EXPLANATION OUTSIDE JSON.
STRICT RULE: PERSIST INTENT.If user picked a room / time before login, REMEMBER IT and skip questions after login.
DO NOT ASK FOR THE USER'S PASSWORD. Only ask for Student ID if needed for context, but login itself is manual.
reply always in Chinese.`;
}

/* ── Callbacks ───────────────────────────────────────────── */

export interface LangGraphCallbacks {
    onShowWebView: () => void;
    onHideWebView: () => void;
    onNavigateWebView: (url: string) => void;
    onPushMessage: (content: string, quickReplies?: string[]) => void;
}

/* ── Executor ────────────────────────────────────────────── */

export class LangGraphExecutor {
    private model: ChatOpenAI;
    private graph: any;
    private conversationHistory: BaseMessage[] = [];
    private callbacks: LangGraphCallbacks | null = null;
    private tempCredentials: { email: string; password: string } | null = null;
    private activeUrl: string = DEFAULT_BOOKING_URL;
    private currentSlotInfo: string = "";

    constructor(userId: string) {
        if (typeof process !== 'undefined' && process.env) {
            process.env.OPENAI_API_KEY = AGENT_CONFIG.DEEPSEEK_API_KEY;
        }

        this.model = new ChatOpenAI({
            apiKey: AGENT_CONFIG.DEEPSEEK_API_KEY,
            configuration: { baseURL: AGENT_CONFIG.DEEPSEEK_BASE_URL },
            model: "deepseek-chat",
            temperature: 0.3,
        });

        const workflow = new StateGraph(AgentState)
            .addNode("think", this.thinkNode.bind(this))
            .addEdge(START, "think")
            .addEdge("think", END);

        this.graph = workflow.compile();
    }

    setCallbacks(cb: LangGraphCallbacks) {
        this.callbacks = cb;
        BrowserTools.setBrowserCallbacks({
            onNavigate: cb.onNavigateWebView,
            onShowWebView: cb.onShowWebView,
            onHideWebView: cb.onHideWebView,
        });
    }

    resetConversation() {
        this.conversationHistory = [];
        this.tempCredentials = null;
    }

    private async thinkNode(state: typeof AgentState.State) {
        try {
            const systemMsg = new SystemMessage(buildChatPrompt());
            const response = await this.model.invoke([
                systemMsg,
                ...state.messages,
            ]);

            const raw = response.content;
            let text = typeof raw === 'string' ? raw : JSON.stringify(raw);

            // 1. Pre-clean: remove markdown blocks if they exist
            text = text.replace(/```json\s * /g, '').replace(/```\s*/g, '').trim();

            // 2. Extract JSON: Find the outermost { }
            let result: any = null;
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');

            if (start !== -1 && end !== -1 && end > start) {
                const jsonStr = text.substring(start, end + 1);
                try {
                    // Try parsing the cleaned substring
                    result = JSON.parse(jsonStr);
                } catch (innerParseErr) {
                    console.warn('[LangGraph] Inner JSON parse failed, trying aggressive sanitize.');
                    // Aggressive sanitize: remove common LLM artifacts that break JSON
                    const sanitized = jsonStr
                        .replace(/\\n/g, ' ') // replace literal \n with space
                        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // remove control characters
                        .replace(/\,(\s*[\]\}])/g, '$1'); // remove trailing commas
                    result = JSON.parse(sanitized);
                }
            }

            if (!result || !result.reply) {
                // If we couldn't find a JSON or it's missing the critical 'reply' field
                throw new Error("Invalid or missing JSON structure");
            }

            return {
                messages: [new AIMessage(result.reply)],
                steps: [{ ...result }],
                sender: "thinking",
                duration: result.action?.input?.duration || state.duration,
                numUsers: result.action?.input?.numUsers || state.numUsers,
                targetDate: result.action?.input?.date || state.targetDate,
                targetTime: result.action?.input?.time || state.targetTime,
                targetRoomId: result.action?.input?.roomId || state.targetRoomId,
            };

        } catch (e: any) {
            console.error('[LangGraph] ThinkNode Error:', e.message);
            // FAILSAFE: Provide a human-readable reply if the LLM fails to JSON
            const fallbackReply = "抱歉，由于网络波动，系统未能正确解析操作指令。请问您可以再试一次刚才的操作吗？";
            return {
                messages: [new AIMessage(fallbackReply)],
                steps: [{ thought: "JSON recovery failed", reply: fallbackReply }],
                sender: "thinking",
            };
        }
    }

    /* ── Main process() ──────────────────────────────────── */

    async process(prompt: string) {
        this.conversationHistory.push(new HumanMessage(prompt));

        try {
            const finalState = await this.graph.invoke({
                messages: [...this.conversationHistory],
                userId: "demo-user",
                steps: [],
            });

            const step = finalState.steps?.[0];
            if (!step) {
                return { steps: [], finalAnswer: "抱歉，请稍后再试。", quickReplies: [] };
            }

            const reply = step.reply || "请问您需要什么？";
            this.conversationHistory.push(new AIMessage(reply));

            const action = step.action;
            if (action?.tool) {
                const input = action.input || {};

                switch (action.tool) {
                    case 'start_manual_login':
                        setTimeout(() => this.autoManualLogin(finalState, input), 200);
                        return { steps: [step], finalAnswer: reply, quickReplies: [] };

                    case 'scan_date':
                        setTimeout(() => this.autoScanDate(input.date), 200);
                        return { steps: [step], finalAnswer: reply, quickReplies: [] };

                    case 'book_slot':
                        setTimeout(() => this.autoBookSlot(finalState, input.slotInfo), 200);
                        return { steps: [step], finalAnswer: reply, quickReplies: [] };

                    case 'fast_locate':
                        setTimeout(() => this.autoFastLocate(finalState, input.url), 200);
                        return { steps: [step], finalAnswer: reply, quickReplies: [] };
                }
            }

            return { steps: [step], finalAnswer: reply, quickReplies: step.quickReplies || [] };
        } catch (error: any) {
            console.error('[LangGraph] Error:', error.message);
            return { steps: [], finalAnswer: "系统繁忙，请稍后再试。", quickReplies: [] };
        }
    }

    /* ══════════════════════════════════════════════════════
     * DETERMINISTIC AUTOMATION
     * Based on REAL HKBU page structure:
     * - SSO: email field → password field → "Log in" → Duo
     * - Booking grid: table with rooms × time slots
     * - New Booking form: Duration + No of Users + Submit
     * ══════════════════════════════════════════════════════ */

    private push(msg: string, qr?: string[]) {
        this.callbacks?.onPushMessage(msg, qr);
    }

    /**
     /** Hybrid Phase 1: Open WebView for user to login manually.
     *  Polls until isBookingPage comes true. */
    private async autoManualLogin(state: any, input: any) {
        try {
            const roomType = input.roomType || 'Group Study Rooms';
            this.activeUrl = BOOKING_URLS[roomType] || DEFAULT_BOOKING_URL;

            this.push("🌐 正在为您打开登录页面，请手动完成授权...");
            await BrowserTools.navigate(this.activeUrl);
            this.callbacks?.onShowWebView();

            // Poll for login success (max 5 minutes for manual login) Reduced to 1.5s for faster response
            for (let i = 0; i < 200; i++) {
                await this.delay(1500);
                const pageText = await BrowserTools.readPage();

                if (this.isGridPage(pageText)) {
                    this.push("✅ 登录成功！正在为您全力抢占您的目标时段...");
                    this.callbacks?.onHideWebView();

                    // IMPROVEMENT Phase 16: Intent Persistence
                    // If the user already specified targetDate and targetTime, skip questions and JUMP.
                    if (state.targetDate) {
                        this.push(`🧠 记得您要预订：${state.targetDate} ${state.targetTime || '全天'}...`);
                        await this.autoExecuteDirectBooking({
                            date: state.targetDate,
                            time: state.targetTime,
                            duration: state.duration,
                            numUsers: state.numUsers
                        });
                    } else {
                        this.push("你想预订哪一天的座位？", ["今天", "明天", "后天"]);
                        this.conversationHistory.push(new AIMessage("用户登录成功。询问日期。"));
                    }
                    return;
                }
            }

            this.push("⚠️ 等待登录超时。如有需要请重新发起。");
        } catch (err: any) {
            this.push("⚠️ 发生错误：" + err.message);
        }
    }

    /** Direct execution after manual login for specific requests */
    private async autoExecuteDirectBooking(input: any) {
        try {
            const dateInfo = this.extractDateInfo(input.date);
            if (dateInfo) {
                const roomType = input.roomType || 'Group Study Rooms';
                const baseUrl = BOOKING_URLS[roomType] || DEFAULT_BOOKING_URL;
                const jumpUrl = `${baseUrl}?date=${dateInfo.formattedDate}`;
                this.push(`🚀 执行“直接跳转”到 ${dateInfo.formattedDate}...`);
                await BrowserTools.navigate(jumpUrl);
                await this.delay(3000);
            }

            const scanResult = await this.scanBookingGrid();
            if (!scanResult) return;

            const targetTime = (input.time || '').split('-')[0].trim();
            const matchSlot = scanResult.slots.find(
                (s: any) => s.status === 'available' && s.time.includes(targetTime)
            );

            if (matchSlot) {
                const roomIdx = scanResult.rooms.findIndex((r: string) => r.includes(matchSlot.room)) + 1;
                await this.clickAndBook(matchSlot.time, roomIdx, scanResult);
            } else {
                this.push(`⚠️ 抱歉，没找到 ${input.date} ${input.time} 的可用位子。`);
                this.showAvailableSlots(scanResult);
            }
        } catch (e: any) {
            this.push("⚠️ 后台自动预订时出错：" + e.message);
        }
    }

    /** Book a slot the user picked from scan results */
    private async autoBookSlot(state: any, slotInfo: string) {
        this.currentSlotInfo = slotInfo;
        // Extract intended duration/users from state upfront for scope visibility
        const targetDuration = state.duration || "2 Hours";
        const targetNumUsers = state.numUsers || "2";

        try {
            this.push("🔍 正在启动“闪电跳转”预订流程...");

            // 1. Try to parse "10:00 - Group Study Room 2"
            const match = slotInfo.match(/^(\d{1,2}:\d{2})\s*[-—]\s*(.+)$/);

            // 2. Advanced Parametric Fallback:
            // If the user picked a common room, we can "guess" the ID even if the scan failed.
            // Room IDs from HKBU GSR system:
            const roomToId: Record<string, string> = {
                'Group Study Room 1': '6',
                'Group Study Room 2': '5',
                'Group Study Room 3': '4',
                'Group Study Room 4': '3',
                'Group Study Room 5': '2',
                'Group Study Room 6': '1',
                'GSR 1': '6', 'GSR 2': '5', 'GSR 3': '4', 'GSR 4': '3', 'GSR 5': '2', 'GSR 6': '1',
            };

            if (match) {
                const time = match[1].trim();
                const startTime = time.split(':')[0]; // e.g. "09:00" -> "9"
                const roomNameRaw = match[2].trim();
                const cleanRoomName = roomNameRaw.split('(')[0].trim();
                const roomId = roomToId[cleanRoomName];

                // If we have both Date (from history) and Room ID + Time, we can JUMP.
                const lastDateStep = this.conversationHistory.slice().reverse().find(m => {
                    const content = typeof m.content === 'string' ? m.content : '';
                    return content.includes('202');
                });
                const contentStr = lastDateStep && typeof lastDateStep.content === 'string' ? lastDateStep.content : '';
                const dateMatch = contentStr.match(/\d{8}/);
                const formattedDate = dateMatch ? dateMatch[0] : null;

                if (roomId && formattedDate) {
                    const duMatch = this.currentSlotInfo.match(/(\d)\s*小时/);
                    const hours = duMatch ? duMatch[1] : "2";
                    // Phase 22: Hardcode du=2 for the JUMP URL to ensure navigation succeeds.
                    // The actual duration will be selected by SUBMIT_BOOKING_SCRIPT on the form page.
                    const du = "2";

                    const jumpTarget = `${this.activeUrl}book?room=${roomId}&date=${formattedDate}&stime=${parseInt(startTime)}&du=${du}`;
                    this.push(`🚀 触发“超级参数化秒杀”，直达预订页: ${cleanRoomName} ${time} (${hours}小时)...`);
                    await BrowserTools.navigate(jumpTarget);
                    await this.delay(3000);

                    const pageText = await BrowserTools.readPage();
                    if (this.isLoginPage(pageText)) {
                        this.push("🔒 检测到 Single Sign-on 页面，请先完成手动登录。");
                        await this.autoManualLogin(null, { targetUrl: jumpTarget });
                    } else if (this.isFormPage(pageText)) {
                        await this.submitBookingForm(targetDuration, targetNumUsers);
                        return;
                    } else if (this.isGridPage(pageText)) {
                        this.push("⚠️ 直达跳转后仍停留在列表页，正在尝试扫描...");
                    } else {
                        // Unknown page, try submitting form just in case
                        await this.submitBookingForm(targetDuration, targetNumUsers);
                        return;
                    }
                }
            }

            // Fallback to standard flow if Jump isn't possible
            this.push(`📡 定位时段中: ${slotInfo}...`);
            const scanResult = await this.scanBookingGrid();
            if (!scanResult || scanResult.error) {
                this.push("⚠️ 获取页面状态失败。");
                return;
            }

            // Parse for fallback scan
            const fallbackTime = match ? match[1].trim() : (slotInfo.match(/(\d{1,2}:\d{2})/)?.[1] || '');
            const fallbackRoom = match ? match[2].trim().split('(')[0].trim() : '';

            // Find the room column index (1-based)
            const roomIdx = scanResult.rooms.findIndex((r: string) => r.includes(fallbackRoom)) + 1;
            if (roomIdx < 1) {
                this.push(`⚠️ 找不到房间列: "${fallbackRoom}"。尝试直接点击...`);
                await BrowserTools.clickElement(slotInfo);
                await this.delay(3000);
                await this.submitBookingForm(targetDuration, targetNumUsers);
                return;
            }

            await this.clickAndBook(fallbackTime, roomIdx, scanResult, targetDuration, targetNumUsers);

        } catch (err: any) {
            console.error('[AutoBookSlot] Standard flow failed, attempting Vision Fallback...', err);
            this.push("🧩 标准定位失败，正在尝试“视觉辅助”定位...");

            try {
                // 1. Capture visual state
                const visualData = await BrowserTools.captureScreenshot();

                // 2. Ask VLM for coordinates
                const prompt = `你是一个视觉自动化助手。当前页面是一个订位表格预览：
${visualData}

用户想要点击的时段是：${slotInfo}
请分析视觉数据，给出这个时段对应的“可用”按钮的中心像素坐标(x, y)。
只返回 JSON 格式: { "x": number, "y": number, "found": boolean } `;

                const visionResponse = await this.model.invoke([
                    new SystemMessage("你是一个精准的网页视觉坐标解析专家。"),
                    new HumanMessage(prompt)
                ]);

                const content = typeof visionResponse.content === 'string' ? visionResponse.content : '';
                const coords = JSON.parse(content.replace(/```json | ```/g, '').trim());

                if (coords.found && coords.x && coords.y) {
                    this.push(`👁️ 视觉模型锁定了坐标(${coords.x}, ${coords.y})，正在执行“盲点”预订...`);
                    const result = await BrowserTools.tapAt(coords.x, coords.y);
                    this.push("✅ 视觉点击结果：" + result);
                    await this.delay(3000);
                    await this.submitBookingForm(targetDuration, targetNumUsers);
                } else {
                    this.push("⚠️ 视觉识别也未能锁定目标位子。");
                }
            } catch (vErr: any) {
                this.push("⚠️ 视觉辅助功能不可用：" + vErr.message);
            }
        }
    }


    private isGridPage(text: string): boolean {
        const lower = text.toLowerCase();
        return lower.includes('step 1:') ||
            lower.includes('select the date') ||
            lower.includes('view the status') ||
            lower.includes('房間預訂') ||
            lower.includes('选择日期');
    }

    private isFormPage(text: string): boolean {
        const lower = text.toLowerCase();
        return lower.includes('step 2:') ||
            lower.includes('booking detail') ||
            lower.includes('details of your booking') ||
            lower.includes('預訂詳情') ||
            lower.includes('预订详情');
    }

    private isLoginPage(text: string): boolean {
        const lower = text.toLowerCase();
        return lower.includes('single sign-on') ||
            lower.includes('sso') ||
            lower.includes('login') ||
            lower.includes('登錄') ||
            lower.includes('登入');
    }

    /* ── Booking Grid Scanner ────────────────────────────── */

    private async scanBookingGrid(): Promise<any | null> {
        const { agentBridge } = require('./bridge');
        try {
            // Attempt up to 3 times to handle slow AJAX loading or iframe leaps
            for (let i = 0; i < 3; i++) {
                const result = await agentBridge.injectAndObserve(SCAN_SLOTS_SCRIPT, 'BOOKING_SLOTS', 10000);

                // --- CASE 0: Iframe Leap Request ---
                if (result && result.payload?.followUrl) {
                    const followUrl = result.payload.followUrl;
                    this.push("🚀 检测到嵌套框架，正在执行“破墙跳转”...");
                    await BrowserTools.navigate(followUrl);
                    await this.delay(3000); // Wait for flattened page to load
                    continue; // Retry scanning the now-flattened page
                }

                // Success case: Grid found and contains data
                if (result && !result.error && (result.slots || []).length > 0) {
                    return result;
                }

                // Case 0: Library is CLOSED (Phase 18)
                if (result && result.error === 'LIBRARY_CLOSED') {
                    this.push(`🏨 系统提示：${result.message} `);
                    return result;
                }

                // Case 1: Grid table not identified yet (Score too low)
                if (result && result.error && result.error.includes('Score too low')) {
                    if (i < 2) {
                        this.push(`⏳ 正在深度探测订位表(尝试 ${i + 1}/3)...`);
                        await this.delay(2000);
                        continue;
                    }
                    // Failure: Report diagnostic data if available
                    this.push("⚠️ 在当前页面没找到订位表。");
                    if (result.diag && result.diag.length > 0) {
                        const top = result.diag.sort((a: any, b: any) => b.score - a.score)[0];
                        this.push(`💡 视觉解析：页面共有 ${result.debug?.tablesFound} 个表，最佳匹配分数 ${top.score}。内容片段: "${top.snippet}..."`);
                    }
                    return result;
                }

                // Case 2: Grid found but it's EMPTY (Slots still loading in background)
                if (result && !result.error && (result.slots || []).length === 0) {
                    if (i < 2) {
                        this.push("📡 订位表加载中，等待内容刷新...");
                        await this.delay(2000);
                        continue;
                    }
                    this.push("⚠️ 已找到订位表，但没检测到可用时段。");
                }

                return result;
            }
            return null;
        } catch (e) {
            this.push("⚠️ 无法读取预订页面。");
            return null;
        }
    }

    /* ── Show Available Slots ────────────────────────────── */

    private showAvailableSlots(scanResult: any) {
        const available = (scanResult.slots || []).filter((s: any) => s.status === 'available');

        if (available.length === 0) {
            this.push("⚠️ 当前日期暂无可用时段。可以试试其他日期。");
            return;
        }

        // Group by time for display
        const byTime: Record<string, string[]> = {};
        available.forEach((s: any) => {
            if (!byTime[s.time]) byTime[s.time] = [];
            byTime[s.time].push(s.room);
        });

        const display = Object.entries(byTime)
            .map(([time, rooms]) => `${time}  →  ${rooms.join('、')} `)
            .join('\n');

        this.push([
            `📅 ${scanResult.date || '当日'} `,
            `✅ ${available.length} 个可用时段：\n`,
            display,
        ].join('\n'));

        // Quick replies: show first 8 available time+room combos
        const quickOptions = available.slice(0, 8).map(
            (s: any) => `${s.time} - ${s.room} `
        );
        this.push("请选择要预订的时段：", quickOptions);

        this.conversationHistory.push(new AIMessage(
            `已展示 ${available.length} 个可用时段。等待用户选择。`
        ));
    }

    /* ── Click Slot + Submit Booking ──────────────────────── */

    private async clickAndBook(time: string, roomIdx: number, scanResult: any, targetDuration?: string, targetNumUsers?: string) {
        const { agentBridge } = require('./bridge');

        this.push("🖱️ 正在尝试进入详情页...");
        try {
            // Find the specific slot to get its bookingUrl
            const slot = (scanResult.slots || []).find((s: any) => s.time === time && scanResult.rooms[roomIdx - 1]?.includes(s.room));
            const bookingUrl = slot?.bookingUrl;

            const clickResult = await agentBridge.injectAndObserve(
                CLICK_SLOT_SCRIPT(time, roomIdx, bookingUrl), 'CLICK_SLOT_RESULT', 8000
            );

            if (!clickResult.success) {
                this.push("⚠️ 无法点击该时段：" + clickResult.message);
                return;
            }

            // Wait and Verify that we have LEFT the grid and ENTERED the form
            this.push("⏳ 等待详情页加載...");
            let formReady = false;
            for (let i = 0; i < 5; i++) {
                await this.delay(1500);
                const pageText = await BrowserTools.readPage();
                // If we see "Duration" or "Users" or "Reference", we are on the form
                if (pageText.toLowerCase().includes('duration') || pageText.toLowerCase().includes('users') || pageText.toLowerCase().includes('booking detail')) {
                    formReady = true;
                    break;
                }
                // If we are still on the grid, try clicking again once
                if (i === 2 && (pageText.includes('Step 1:') || pageText.includes('Select the date'))) {
                    console.log('[Retry] Clicking slot again...');
                    await agentBridge.injectAndObserve(CLICK_SLOT_SCRIPT(time, roomIdx), 'CLICK_SLOT_RESULT', 5000);
                }
            }

            if (!formReady) {
                this.push("⚠️ 无法进入预订详情页（一直停留在列表页）。请尝试手动点一下该时段。");
                return;
            }

            await this.submitBookingForm(targetDuration, targetNumUsers);

        } catch (e: any) {
            this.push("⚠️ 处理预订时出错：" + e.message);
        }
    }

    private async autoFastLocate(state: any, url: string) {
        try {
            this.push("🚀 执行“定位”秒杀，直达 URL...");
            await BrowserTools.navigate(url);
            await this.delay(4000);

            // Check if we reached the form or stayed on grid
            const pageText = await BrowserTools.readPage();
            if (this.isLoginPage(pageText)) {
                this.push("🔒 为执行定位，请先完成登录。");
                await this.autoManualLogin(null, { targetUrl: url });
            } else if (this.isFormPage(pageText)) {
                await this.submitBookingForm(state.duration, state.numUsers);
            } else if (this.isGridPage(pageText)) {
                this.push("⚠️ 定位后停留在列表页，可能是该时段不可用。正在扫描...");
                const res = await this.scanBookingGrid();
                if (res) this.showAvailableSlots(res);
            } else {
                // Unknown but let's try form
                await this.submitBookingForm(state.duration, state.numUsers);
            }
        } catch (e: any) {
            this.push("⚠️ 定位执行失败：" + e.message);
        }
    }

    private async submitBookingForm(targetDuration?: string, targetNumUsers?: string): Promise<void> {
        const { agentBridge } = require('./bridge');

        this.push("📝 正在提交预订并发起最后确认...");
        try {
            // [FIX PHASE 25]: REVERSE PRIORITY. User intent (targetDuration) must ALWAYS win.
            let duValue = null;
            if (targetDuration) {
                duValue = targetDuration.match(/\d/)?.[0];
            }
            if (!duValue) {
                duValue = this.currentSlotInfo.match(/(\d)\s*小时/)?.[1];
            }
            if (!duValue) duValue = "2";

            let users = null;
            if (targetNumUsers) {
                users = targetNumUsers.match(/\d/)?.[0];
            }
            if (!users) {
                users = this.currentSlotInfo.match(/(\d)\s*人/)?.[1];
            }
            if (!users) users = "2";

            // Robust singular/plural handling for dropdown selection
            const durationLabel = duValue === "1" ? "1 Hour" : duValue + " Hours";

            const result = await agentBridge.injectAndObserve(
                SUBMIT_BOOKING_SCRIPT(durationLabel, users), 'SUBMIT_TRIGGERED', 8000
            );

            if (!result.success) {
                const isGrid = result.message?.includes('Still on grid page');
                if (isGrid) {
                    const visualSnapshotStr = await BrowserTools.captureScreenshot();
                    let elements = [];
                    try {
                        const snapshot = JSON.parse(visualSnapshotStr);
                        elements = snapshot.elements || [];
                    } catch (e) {
                        console.warn("Failed to parse visual snapshot elements", e);
                    }

                    this.push("🧩 仍停留在列表页，正在尝试“视觉点击”进入详情页...");

                    const systemPrompt = `You are a visual reasoning agent. 
Find the EXACT coordinates for the booking slot: ${this.currentSlotInfo}.
CRITICAL: If a "Privacy", "Consent", "Accept", or "✕" overlay is blocking the view, return the coordinate for THAT button first to dismiss it.
Current elements: ${JSON.stringify(elements)}
Return ONLY JSON: { "x": number, "y": number, "found": boolean, "label": string } `;

                    const visionResponse = await this.model.invoke([
                        new SystemMessage(systemPrompt),
                        new HumanMessage("请分析以上元素列表，给出目标点的 JSON 坐标。")
                    ]);

                    const content = typeof visionResponse.content === 'string' ? visionResponse.content : '';
                    const coords = JSON.parse(content.replace(/```json | ```/g, '').trim());

                    if (coords.found && coords.x && coords.y) {
                        this.push(`👁️ 视觉锁定了时段坐标(${coords.x}, ${coords.y})，尝试进入详情页...`);
                        await BrowserTools.tapAt(coords.x, coords.y);
                        await this.delay(3000);
                        // After visual click on grid, try submitting again
                        return this.submitBookingForm(targetDuration, targetNumUsers);
                    } else {
                        this.push("⚠️ 视觉识别未能锁定目标。");
                        return;
                    }
                } else {
                    this.push("🧩 提交按钮定位失败，正在尝试“视觉辅助”提交...");

                    const visualData = await BrowserTools.captureScreenshot();
                    const prompt = `你是一个视觉自动化助手。当前页面是一个预订详情表单。
${visualData}

目标是点击“提交”、“确认”或“Submit”按钮。
请分析视觉数据，给出该按钮的中心像素坐标(x, y)。
只返回 JSON 格式: { "x": number, "y": number, "found": boolean } `;

                    const visionResponse = await this.model.invoke([
                        new SystemMessage("你是一个精准的网页视觉坐标解析专家。"),
                        new HumanMessage(prompt)
                    ]);

                    const content = typeof visionResponse.content === 'string' ? visionResponse.content : '';
                    const coords = JSON.parse(content.replace(/```json | ```/g, '').trim());

                    if (coords.found && coords.x && coords.y) {
                        this.push(`👁️ 视觉锁定了提交按钮(${coords.x}, ${coords.y})，正在强制提交...`);
                        await BrowserTools.tapAt(coords.x, coords.y);
                        await this.delay(3000);
                    } else {
                        this.push("⚠️ 视觉识别未能锁定目标。");
                        return;
                    }
                }
            }

            // Now poll the page to see if it shows "Success" or a "Reference Number"
            this.push("📡 等待系统返回确认信息（最多 30 秒）...");

            for (let i = 0; i < 15; i++) {
                await this.delay(2000);
                const pageText = await BrowserTools.readPage();

                // [FIX PHASE 24]: Skip transient "Error reading page" strings (timeouts) 
                if (pageText.includes('Error reading page')) {
                    continue;
                }

                const lower = pageText.toLowerCase();

                // Success indicators (En & Zh)
                if (lower.includes('reference no') || lower.includes('success') || lower.includes('confirmed') ||
                    lower.includes('booking detail') || lower.includes('thank you') ||
                    lower.includes('my booking record') || lower.includes('booking result') ||
                    lower.includes('預訂成功') || lower.includes('成功預訂') || lower.includes('参考编号') || lower.includes('參考編號') || lower.includes('多謝')) {

                    this.push("✅ 预订成功！您应该很快会收到确认邮件。同时也建议您前往「My Booking Record」核对。");
                    this.tempCredentials = null;
                    return;
                }

                // Failure indicators (En & Zh)
                if (lower.includes('conflict') || lower.includes('already') || lower.includes('limit') ||
                    lower.includes('exceeded') || lower.includes('error') || lower.includes('failed') ||
                    lower.includes('invalid') || lower.includes('冲突') || lower.includes('冲突') || lower.includes('冲突') ||
                    lower.includes('額滿') || lower.includes('限額') || lower.includes('錯誤')) {

                    const lines = pageText.split('\n');
                    const msg = lines.find(l =>
                        l.toLowerCase().includes('conflict') ||
                        l.toLowerCase().includes('limit') ||
                        l.toLowerCase().includes('error') ||
                        l.toLowerCase().includes('already') ||
                        l.toLowerCase().includes('冲突') ||
                        l.toLowerCase().includes('错误') ||
                        l.toLowerCase().includes('錯誤')
                    ) || "预订冲突、超过限额或系统错误";

                    this.push("⚠️ 预订失败：" + msg.trim());
                    this.tempCredentials = null;
                    return;
                }
            }

            // Diagnostic Dump if timeout
            const finalPage = await BrowserTools.readPage();
            this.push(`💡 30秒内未检测到结果。当前页面开头内容：\n"${finalPage.substring(0, 500)}..."\n\n如果页面提示了成功，请告诉我。`);
            this.tempCredentials = null;

        } catch (e: any) {
            this.push("⚠️ 提交出错：" + e.message);
        }
    }

    /** Phase A - Final Step 2: User picked a date, click it and scan slots */
    private async autoScanDate(dateStr: string) {
        try {
            this.push(`⏳ 正在查询「${dateStr}」的时段...`);

            const dateInfo = this.extractDateInfo(dateStr);
            if (dateInfo) {
                // Determine current roomType context (default to GSR if unknown)
                // In a more complex agent, we'd store the current roomType in State
                const jumpUrl = `${this.activeUrl}?date=${dateInfo.formattedDate}`;
                this.push(`🚀 执行“直接跳转”到 ${dateInfo.formattedDate}...`);
                await BrowserTools.navigate(jumpUrl);
                await this.delay(3000); // Wait for grid to update
            }

            const scanResult = await this.scanBookingGrid();
            if (scanResult) {
                this.showAvailableSlots(scanResult);
            }
        } catch (err: any) {
            this.push("⚠️ 查询出错：" + err.message);
        }
    }

    /* ── Helpers ──────────────────────────────────────────── */

    /** Extract day and month offset from string like "2月26日", "明天", "2.26" */
    private extractDateInfo(dateStr: string): { day: number; monthOffset: number; formattedDate: string } | null {
        // Use Hong Kong Time (UTC+8) for consistent library booking logic
        // Stop using new Date(toLocaleString) - it's unsafe in Node. Use part-based extraction.
        const options: any = { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA gives YYYY-MM-DD
        const parts = formatter.formatToParts(new Date());

        const year = parseInt(parts.find(p => p.type === 'year')?.value || '2026');
        const month = parseInt(parts.find(p => p.type === 'month')?.value || '2') - 1; // 0-indexed
        const day = parseInt(parts.find(p => p.type === 'day')?.value || '19');

        const today = new Date(year, month, day);
        const currentYear = year;
        const currentMonth = month;
        const formatDate = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}${m}${dd}`; // HKBU style: YYYYMMDD
        };

        // 1. Relative dates
        if (dateStr.includes('今天')) {
            return { day: today.getDate(), monthOffset: 0, formattedDate: formatDate(today) };
        }
        if (dateStr.includes('明天')) {
            const d = new Date(today); d.setDate(d.getDate() + 1);
            const offset = (d.getFullYear() * 12 + d.getMonth()) - (currentYear * 12 + currentMonth);
            return { day: d.getDate(), monthOffset: offset, formattedDate: formatDate(d) };
        }
        if (dateStr.includes('后天')) {
            const d = new Date(today); d.setDate(d.getDate() + 2);
            const offset = (d.getFullYear() * 12 + d.getMonth()) - (currentYear * 12 + currentMonth);
            return { day: d.getDate(), monthOffset: offset, formattedDate: formatDate(d) };
        }

        // 2. Absolute dates (e.g. "2月26日", "2.26", "2/26")
        const absMatch = dateStr.match(/(?:(\d{1,2})[月\/\.])?(\d{1,2})日?/);
        if (absMatch) {
            const m = absMatch[1] ? parseInt(absMatch[1]) - 1 : currentMonth;
            const dVal = parseInt(absMatch[2]);

            // Calculate month offset
            let targetYear = currentYear;
            if (m < currentMonth && m >= 0) targetYear++; // Assume next year if month is earlier

            const dObj = new Date(targetYear, m, dVal);
            const offset = (targetYear * 12 + m) - (currentYear * 12 + currentMonth);
            return { day: dVal, monthOffset: offset, formattedDate: formatDate(dObj) };
        }

        return null;
    }

    private async injectScript(script: string, eventType: string): Promise<any> {
        const { agentBridge } = require('./bridge');
        return agentBridge.injectAndObserve(script, eventType, 8000);
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
