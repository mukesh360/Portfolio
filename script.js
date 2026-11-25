/* =========================================================
   CONFIG — the only values you ever need to edit.
   Everything time-based on the page is derived from these.
   ========================================================= */
const CONFIG = {
    roleStart: '2026-08-24',       // joining date at Markus.ai (YYYY-MM-DD)
    programMonths: 12,             // internship length (one year)
    github: 'mukesh360',           // GitHub username for live data
    siteRepo: 'Portfolio',         // repo this site lives in ("site updated …")
    timeZone: 'Asia/Kolkata',      // all dates/times shown in IST
    workHours: { days: [1, 2, 3, 4, 5], from: 9, to: 19 }   // Mon–Fri, 09:00–19:00 IST
};

(() => {
    window.__siteReady = true;          // tells the head failsafe that JS is running
    const root = document.documentElement;
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Time helpers (always IST, regardless of visitor's zone) ---------- */
    const istParts = (date = new Date()) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
            timeZone: CONFIG.timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23'
        }).formatToParts(date).map(x => [x.type, x.value]));
        const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
        return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour, min: +p.minute, wd };
    };

    const [startY, startM, startD = 1] = CONFIG.roleStart.split('-').map(Number);
    // Completed months since joining, ticking over on the monthly anniversary
    // (joined Aug 24 → becomes "4 mos" on Dec 24)
    const monthsInRole = now =>
        Math.max(1, (now.y - startY) * 12 + (now.m - (startM - 1)) - (now.d < startD ? 1 : 0));

    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const formatTenure = total => {
        const yrs = Math.floor(total / 12), mos = total % 12;
        return [yrs && plural(yrs, 'yr'), mos && plural(mos, 'mo')].filter(Boolean).join(' ');
    };

    const monthFmt = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });
    const clockFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: CONFIG.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const timeAgo = iso => {
        const secs = (new Date(iso) - Date.now()) / 1000;
        const units = [['year', 31536e3], ['month', 2592e3], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
        for (const [u, s] of units) if (Math.abs(secs) >= s) return rtf.format(Math.round(secs / s), u);
        return 'just now';
    };

    const setText = (sel, text) => $$(sel).forEach(el => { if (el.textContent !== text) el.textContent = text; });

    /* ---------- Count-up numbers ---------- */
    const countUp = el => {
        el.dataset.counted = '1';
        const target = () => Number(el.dataset.target ?? el.textContent) || 0;
        if (reduceMotion) { el.textContent = target(); return; }
        const t0 = performance.now(), dur = 1600;
        const step = t => {
            const p = Math.min(1, (t - t0) / dur);
            el.textContent = Math.round(target() * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };
    // Change a stat's value: animate later if not yet seen, otherwise update in place
    const setStat = (el, value) => {
        el.dataset.target = value;
        if (el.dataset.counted) el.textContent = value;
    };

    /* =========================================================
       LIVE REFRESH — one scheduler for everything time-based.
       Runs on load, on every minute boundary, and whenever the
       tab becomes visible again, so nothing ever goes stale.
       ========================================================= */
    let ghRepos = null;

    const refresh = () => {
        const now = istParts();

        // Clock + copyright year
        setText('[data-clock]', clockFmt.format(new Date()));
        setText('[data-year]', String(now.y));

        // Experience: tenure, date range, stat
        const months = monthsInRole(now);
        setText('[data-tenure]', formatTenure(months));
        const startLabel = monthFmt.format(new Date(startY, startM - 1, 1));
        setText('[data-range]', `${startLabel} — Present`);
        setText('[data-since]', startLabel);
        $$('[data-tenure-months]').forEach(el => setStat(el, months));

        // Internship progress track: completed months solid, current month pulsing
        const total = CONFIG.programMonths;
        const done = Math.min(total, months);
        const finished = months >= total;
        const current = finished ? 0 : done + 1;          // month in progress (1-based)
        $$('[data-track]').forEach(track => {
            const ticks = $('.ticks', track);
            if (ticks.children.length !== total) {
                ticks.replaceChildren(...Array.from({ length: total }, () => document.createElement('i')));
            }
            [...ticks.children].forEach((t, i) => {
                t.classList.toggle('on', i < done);
                t.classList.toggle('current', i === current - 1);
            });
            setText('[data-track] .track-label',
                finished ? 'One-year internship · completed' : `Month ${current} of ${total} · one-year internship`);
        });

        // Availability from IST working hours
        const working = CONFIG.workHours.days.includes(now.wd) &&
            now.h >= CONFIG.workHours.from && now.h < CONFIG.workHours.to;
        setText('[data-availability]', working ? 'Working hours, quick replies' : 'Off hours, replies next working day');

        // Relative GitHub times ("3 days ago" keeps ticking)
        if (ghRepos) renderGitHub();
    };

    // Align to the next minute boundary so the clock flips exactly on time
    const scheduleMinute = () => setTimeout(() => { refresh(); scheduleMinute(); }, 60000 - (Date.now() % 60000) + 50);

    /* ---------- Live GitHub data (cached 1h per visitor) ---------- */
    const GH_KEY = 'gh-repos-v2';

    const loadRepos = async (force = false) => {
        if (!force) {
            try {
                const c = JSON.parse(sessionStorage.getItem(GH_KEY) || 'null');
                if (c && Date.now() - c.t < 3600e3) return c.d;
            } catch (e) { }
        }
        const res = await fetch(`https://api.github.com/users/${CONFIG.github}/repos?per_page=100&sort=pushed`);
        if (!res.ok) throw new Error(res.status);
        const d = (await res.json()).map(r => ({
            name: r.name, fork: r.fork, stars: r.stargazers_count, pushed: r.pushed_at
        }));
        try { sessionStorage.setItem(GH_KEY, JSON.stringify({ t: Date.now(), d })); } catch (e) { }
        return d;
    };

    const renderGitHub = () => {
        const byName = new Map(ghRepos.map(r => [r.name, r]));
        const own = ghRepos.filter(r => !r.fork).length;

        setText('[data-gh-repos]', `${own} repos`);
        $$('[data-gh-repo-count]').forEach(el => setStat(el, own));

        $$('[data-repo]').forEach(row => {
            const repo = byName.get(row.dataset.repo);
            const slot = $('[data-gh-meta]', row);
            if (!repo || !slot) return;
            const parts = [`Updated ${timeAgo(repo.pushed)}`];
            if (repo.stars > 0) parts.push(`★ ${repo.stars}`);
            const text = parts.join(' · ');
            if (slot.textContent !== text) slot.textContent = text;
            slot.title = new Date(repo.pushed).toLocaleDateString('en-IN', { dateStyle: 'long', timeZone: CONFIG.timeZone });
            slot.classList.add('ready');
        });

        const site = byName.get(CONFIG.siteRepo);
        $$('[data-site-updated]').forEach(el => {
            if (!site) return;
            el.textContent = `Site updated ${timeAgo(site.pushed)}`;
            el.hidden = false;
        });
    };

    const syncGitHub = force => loadRepos(force)
        .then(d => { ghRepos = d; renderGitHub(); })
        .catch(() => { /* offline / rate-limited: static fallbacks stay */ });

    /* ---------- Boot ---------- */
    $$('[data-ai-count]').forEach(el => setStat(el, $$('.project[data-ai]').length));
    refresh();
    scheduleMinute();
    syncGitHub(false);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        refresh();
        syncGitHub(false);          // cache decides whether to hit the API
    });

    /* ---------- Hero intro (on load) ---------- */
    const startIntro = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('loaded')));

    /* ---------- First-load screen ----------
       Waits for the page + fonts, shows the spinner for at least ~0.9s so it
       never flickers, then lifts away and plays the hero intro. Hard cap 3.5s. */
    if (root.classList.contains('is-loading')) {
        const MIN_MS = reduceMotion ? 300 : 900;
        const finish = () => {
            if (!root.classList.contains('is-loading')) return;
            setTimeout(() => {
                root.classList.remove('is-loading');
                window.dispatchEvent(new Event('loader:done'));
                root.classList.add('loaded');   // hero's start state was painted under the loader
                setTimeout(() => root.classList.remove('first-visit'), 1200);   // remove the overlay
            }, Math.max(0, MIN_MS - performance.now()));
        };
        const pageLoaded = new Promise(r =>
            document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true }));
        Promise.all([pageLoaded, document.fonts ? document.fonts.ready : null]).then(finish, finish);
        setTimeout(finish, 3500);
    } else {
        startIntro();
    }

    /* ---------- Section landing animations ---------- */
    const sections = $$('[data-animate]');
    sections.forEach(sec => $$('.reveal', sec).forEach((el, i) => el.style.setProperty('--i', i)));

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('in');
                $$('[data-count]', entry.target).forEach(countUp);
                io.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        sections.forEach(s => io.observe(s));
    } else {
        sections.forEach(s => { s.classList.add('in'); $$('[data-count]', s).forEach(countUp); });
    }

    /* ---------- Seamless scrolling: inertial smooth scroll ----------
       Skipped for reduced motion; touch devices keep native scrolling. */
    let lenis = null;
    if (window.Lenis && !reduceMotion) {
        lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
        const rafLoop = t => { lenis.raf(t); requestAnimationFrame(rafLoop); };
        requestAnimationFrame(rafLoop);
        if (root.classList.contains('is-loading')) {
            lenis.stop();
            window.addEventListener('loader:done', () => lenis.start(), { once: true });
        }
    }

    // Glide to an in-page target (works with or without Lenis). Returns false if not found.
    const scrollToHash = hash => {
        const toTop = hash === '#' || hash === '#top';
        const target = toTop ? null : $(hash);
        if (!toTop && !target) return false;
        if (lenis) {
            lenis.scrollTo(toTop ? 0 : target, { offset: toTop ? 0 : -24, duration: 1.4 });
        } else {
            window.scrollTo({
                top: toTop ? 0 : target.getBoundingClientRect().top + window.scrollY - 24,
                behavior: reduceMotion ? 'auto' : 'smooth'
            });
        }
        history.replaceState(null, '', toTop ? location.pathname : hash);
        return true;
    };

    document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#"]');
        if (!a || a.classList.contains('skip-link')) return;
        if (scrollToHash(a.getAttribute('href'))) e.preventDefault();
    });

    /* ---------- Header (always visible): progress + active link ---------- */
    const progress = $('.scroll-progress');
    const toTop = $('.to-top');
    const navLinks = $$('.nav a');
    const targets = navLinks.map(a => $(a.getAttribute('href'))).filter(Boolean);
    const indicator = $('.nav-indicator');
    let scrollQueued = false;
    let activeLink = null;

    // Sliding highlight that follows the active nav link
    const moveIndicator = () => {
        if (!indicator) return;
        if (!activeLink || getComputedStyle(indicator).display === 'none') {
            indicator.style.opacity = '0';
            return;
        }
        indicator.style.width = activeLink.offsetWidth + 'px';
        indicator.style.transform = `translate(${activeLink.offsetLeft}px, ${activeLink.offsetTop}px)`;
        indicator.style.opacity = '1';
    };

    const onScroll = () => {
        scrollQueued = false;
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;

        progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
        toTop.classList.toggle('show', y > window.innerHeight * 0.9);

        const probe = y + window.innerHeight * 0.35;
        let current = null;
        targets.forEach(t => { if (t.offsetTop <= probe) current = t.id; });
        if (y >= max - 4) current = targets[targets.length - 1].id;
        // nothing highlighted while still in the hero
        if (targets[0] && y + window.innerHeight * 0.35 < targets[0].offsetTop) current = null;
        const next = navLinks.find(a => a.getAttribute('href') === '#' + current) || null;
        if (next !== activeLink) {
            navLinks.forEach(a => a.classList.toggle('active', a === next));
            activeLink = next;
            moveIndicator();
        }
    };
    onScroll();
    window.addEventListener('resize', moveIndicator);
    if (document.fonts) document.fonts.ready.then(moveIndicator);
    window.addEventListener('scroll', () => {
        if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(onScroll); }
    }, { passive: true });

    /* ---------- Mobile menu ---------- */
    const nav = $('#nav');
    const menuBtn = $('.menu-toggle');
    const setMenu = open => {
        nav.classList.toggle('open', open);
        menuBtn.setAttribute('aria-expanded', String(open));
        $('.menu-label', menuBtn).textContent = open ? 'Close' : 'Menu';
    };
    menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    navLinks.forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

    /* ---------- Theme toggle: seamless circular reveal ---------- */
    const themeBtn = $('.theme-toggle');
    const currentTheme = () =>
        root.dataset.theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

    const toggleTheme = (origin = themeBtn) => {
        const next = currentTheme() === 'light' ? 'dark' : 'light';
        const apply = () => {
            root.dataset.theme = next;
            try { localStorage.setItem('theme', next); } catch (e) { }
        };
        if (!document.startViewTransition || reduceMotion) { apply(); return; }

        const r = origin.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        document.startViewTransition(apply).ready.then(() => {
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
            );
        });
    };
    themeBtn.addEventListener('click', () => toggleTheme());

    /* ---------- Contact form → opens mail client ---------- */
    const form = $('#contactForm');
    const note = $('.form-note', form);
    form.addEventListener('submit', e => {
        e.preventDefault();
        let ok = true;
        $$('input, textarea', form).forEach(f => {
            const valid = f.checkValidity() && f.value.trim() !== '';
            f.classList.toggle('invalid', !valid);
            if (!valid) ok = false;
        });
        if (!ok) { note.textContent = 'Please fill in every field'; return; }

        const { name, email, message } = Object.fromEntries(new FormData(form));
        const body = `${message}\n\n— ${name} (${email})`;
        window.location.href = `mailto:mukesh360r@gmail.com?subject=${encodeURIComponent(`Hello from ${name}`)}&body=${encodeURIComponent(body)}`;
        note.textContent = 'Opening your mail app…';
    });
    form.addEventListener('input', e => e.target.classList.remove('invalid'));

    /* ---------- Hero pipeline: respect reduced motion ---------- */
    const pipeline = $('.pipeline');
    if (pipeline && reduceMotion && pipeline.pauseAnimations) pipeline.pauseAnimations();

    /* ---------- Project hover preview (desktop, fine pointer) ---------- */
    const preview = $('.preview');
    const canHover = window.matchMedia('(hover: hover) and (min-width: 901px)');
    if (preview) {
        const track = $('.preview-track', preview);
        let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, active = false;
        const loop = () => {
            const k = reduceMotion ? 1 : 0.16;
            cx += (tx - cx) * k; cy += (ty - cy) * k;
            preview.style.left = cx + 'px';
            preview.style.top = cy + 'px';
            raf = (active || Math.abs(tx - cx) + Math.abs(ty - cy) > 0.5) ? requestAnimationFrame(loop) : 0;
        };
        $$('.project').forEach((row, i) => {
            row.addEventListener('mouseenter', e => {
                if (!canHover.matches) return;
                // the featured card already shows its diagram inline
                if (row.classList.contains('project--featured')) {
                    active = false; preview.classList.remove('show'); return;
                }
                if (!active) { cx = tx = e.clientX + 40; cy = ty = e.clientY; }
                active = true;
                track.style.transform = `translateY(${-220 * i}px)`;
                preview.classList.add('show');
                if (!raf) raf = requestAnimationFrame(loop);
            });
            row.addEventListener('mousemove', e => { tx = e.clientX + 40; ty = e.clientY; });
        });
        $('.projects').addEventListener('mouseleave', () => { active = false; preview.classList.remove('show'); });
    }

    /* ---------- Toast + copy to clipboard ---------- */
    const toastEl = $('.toast');
    let toastTimer;
    const toast = msg => {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    };

    const copyText = async text => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const t = Object.assign(document.createElement('textarea'), { value: text });
            t.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
        }
        toast('Email copied to clipboard');
    };

    $$('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
        copyText(btn.dataset.copy);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
    }));

    /* ---------- Command menu (⌘K / Ctrl+K, or "/") ---------- */
    const cmdk = $('.cmdk');
    const cmdkInput = $('.cmdk-input');
    const cmdkList = $('#cmdkList');
    const cmdkTrigger = $('.cmdk-trigger');
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    $$('[data-kbd]').forEach(k => { k.textContent = isMac ? '⌘K' : 'Ctrl K'; });

    const EMAIL = 'mukesh360r@gmail.com';
    const open = url => window.open(url, '_blank', 'noopener');
    const go = hash => () => scrollToHash(hash);

    const COMMANDS = [
        { group: 'Navigate', ico: '↗', label: 'About', hint: '01', run: go('#about') },
        { group: 'Navigate', ico: '↗', label: 'Experience', hint: '02', keys: 'markus internship job', run: go('#experience') },
        { group: 'Navigate', ico: '↗', label: 'Selected work', hint: '03', keys: 'projects docintel psychtrend', run: go('#work') },
        { group: 'Navigate', ico: '↗', label: 'Stack', hint: '04', keys: 'skills tools ai', run: go('#stack') },
        { group: 'Navigate', ico: '↗', label: 'Contact', hint: '05', keys: 'email message', run: go('#contact') },
        { group: 'Actions', ico: '⧉', label: 'Copy email address', hint: EMAIL, keys: 'mail', run: () => copyText(EMAIL) },
        { group: 'Actions', ico: '✉', label: 'Send an email', keys: 'mail contact', run: () => { location.href = `mailto:${EMAIL}`; } },
        { group: 'Actions', ico: '◐', label: 'Toggle light / dark theme', keys: 'dark mode theme', run: () => toggleTheme(cmdkTrigger) },
        { group: 'Links', ico: '↗', label: 'Open résumé', keys: 'resume cv', run: () => open('https://drive.google.com/drive/folders/1-S04FxanC22qKMmrHC989dE0iaqY432G?usp=sharing') },
        { group: 'Links', ico: '↗', label: 'GitHub', hint: 'mukesh360', keys: 'code repos', run: () => open('https://github.com/mukesh360') },
        { group: 'Links', ico: '↗', label: 'LinkedIn', keys: 'profile', run: () => open('https://www.linkedin.com/in/mukeshkumar360') },
        { group: 'Links', ico: '↗', label: 'Codolio', keys: 'dsa leetcode problem solving', run: () => open('https://codolio.com/profile/Mukesh_360') },
        { group: 'Links', ico: '↗', label: 'DocIntel AI source', keys: 'rag project', run: () => open('https://github.com/mukesh360/RAG-BOT-') }
    ];

    let shown = [], sel = 0, lastFocus = null;

    const renderCmdk = () => {
        const q = cmdkInput.value.trim().toLowerCase();
        shown = COMMANDS.filter(c => !q || `${c.label} ${c.keys || ''} ${c.group}`.toLowerCase().includes(q));
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        cmdkList.replaceChildren();
        if (!shown.length) {
            cmdkList.innerHTML = '<li class="cmdk-empty">No results</li>';
            return;
        }
        let group = null;
        shown.forEach((c, i) => {
            if (c.group !== group) {
                group = c.group;
                const g = document.createElement('li');
                g.className = 'cmdk-group'; g.textContent = group; g.setAttribute('role', 'presentation');
                cmdkList.appendChild(g);
            }
            const li = document.createElement('li');
            li.className = 'cmdk-item';
            li.id = `cmdk-${i}`;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', String(i === sel));
            li.innerHTML = `<span class="ico" aria-hidden="true"></span><span class="lbl"></span>${c.hint ? '<span class="hint"></span>' : ''}`;
            $('.ico', li).textContent = c.ico;
            $('.lbl', li).textContent = c.label;
            if (c.hint) $('.hint', li).textContent = c.hint;
            li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; markSel(); } });
            li.addEventListener('click', () => runSel(i));
            cmdkList.appendChild(li);
        });
        cmdkInput.setAttribute('aria-activedescendant', `cmdk-${sel}`);
    };

    const markSel = () => {
        $$('.cmdk-item', cmdkList).forEach((li, i) => li.setAttribute('aria-selected', String(i === sel)));
        const cur = $(`#cmdk-${sel}`);
        if (cur) { cur.scrollIntoView({ block: 'nearest' }); cmdkInput.setAttribute('aria-activedescendant', cur.id); }
    };

    const openCmdk = () => {
        if (!cmdk.hidden) return;
        lastFocus = document.activeElement;
        cmdk.hidden = false;
        cmdkInput.value = ''; sel = 0; renderCmdk();
        if (lenis) lenis.stop();
        requestAnimationFrame(() => { cmdk.classList.add('open'); cmdkInput.focus(); });
    };

    const closeCmdk = () => {
        if (cmdk.hidden) return;
        cmdk.classList.remove('open');
        if (lenis) lenis.start();
        setTimeout(() => { cmdk.hidden = true; }, reduceMotion ? 0 : 200);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    const runSel = i => {
        const c = shown[i];
        if (!c) return;
        closeCmdk();
        setTimeout(c.run, 60);   // let the menu close before scrolling/opening
    };

    cmdkTrigger.addEventListener('click', openCmdk);
    $('[data-cmdk-close]').addEventListener('click', closeCmdk);
    cmdkInput.addEventListener('input', () => { sel = 0; renderCmdk(); });

    cmdkInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); markSel(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); markSel(); }
        else if (e.key === 'Enter') { e.preventDefault(); runSel(sel); }
        else if (e.key === 'Tab') { e.preventDefault(); }   // keep focus inside the dialog
    });

    document.addEventListener('keydown', e => {
        const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            cmdk.hidden ? openCmdk() : closeCmdk();
        } else if (e.key === '/' && !typing && cmdk.hidden) {
            e.preventDefault(); openCmdk();
        } else if (e.key === 'Escape') {
            closeCmdk();
        }
    });
})();
