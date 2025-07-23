import React, { useState, useEffect, useMemo } from 'react';

// --- Helper Functions & Constants ---
const parseName = (rawName) => {
    if (typeof rawName !== 'string') return { name: '', sterne: '' };
    const sterneMatch = rawName.match(/(\s*\*+)$/);
    const sterne = sterneMatch ? sterneMatch[1].trim() : '';
    const name = sterneMatch ? rawName.replace(sterneMatch[0], '').trim() : rawName.trim();
    return { name, sterne };
};

const NOTE_OPTIONS = ["", "10.00", "9.75", "9.00", "8.75", "8.50", "10.00 / 9.75", "9.00 / 8.75"];
const KRANZ_TARGETS_NORMAL = [56.50, 56.25, 56.00];
const KRANZ_TARGETS_ESAF = [75.00, 74.75, 74.50];
const POSSIBLE_RESULTS = [
    { score: 8.50, label: "Niederlage" },
    { score: 8.75, label: "Gestellt" },
    { score: 9.00, label: "Gestellt" },
    { score: 9.75, label: "Sieg" },
    { score: 10.00, label: "Sieg" },
];

const parseNoteValue = (noteVal) => {
    if (!noteVal) return { high: 0, low: 0, display: '-' };
    if (noteVal.includes('/')) {
        const [high, low] = noteVal.split('/').map(n => parseFloat(n.trim()));
        return { high, low, display: noteVal };
    }
    const note = parseFloat(noteVal);
    return { high: note, low: note, display: note.toFixed(2) };
};

const getDynamicRankDisplay = (list, index) => {
    if (index === 0) return { rank: 1, display: '1a' };
    const current = list[index];
    let rankCounter = 1;
    let lastScore = list[0].total;
    for (let i = 1; i <= index; i++) {
        if (list[i].total < lastScore) {
            rankCounter++;
            lastScore = list[i].total;
        }
    }
    const previous = list[index - 1];
    if (current.total === previous.total) {
        const prevRankDisplay = getDynamicRankDisplay(list, index - 1).display;
        const prevRankNum = parseInt(prevRankDisplay, 10);
        const lastChar = prevRankDisplay.slice(-1);
        const newChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);
        return { rank: prevRankNum, display: `${prevRankNum}${newChar}` };
    }
    return { rank: rankCounter, display: `${rankCounter}a` };
};


// --- Components ---

const BottomNav = ({ currentView, setCurrentView }) => {
    const navItems = [
        { id: 'startdaten', label: 'Startdaten', icon: '📋' },
        { id: 'zwischenrangliste', label: 'Übersicht', icon: '📊' },
        { id: 'gaenge', label: 'Gänge', icon: '⚔️' },
        { id: 'rangliste', label: 'Live-Rangliste', icon: '🏆' },
    ];
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 flex justify-around z-50">
            {navItems.map(item => (
                <button key={item.id} onClick={() => setCurrentView(item.id)} className={`flex-1 py-2 px-1 text-center transition-colors duration-200 ${currentView === item.id ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-500'}`}>
                    <span className="text-2xl">{item.icon}</span><span className="block text-xs font-medium">{item.label}</span>
                </button>
            ))}
        </div>
    );
};

const StartDatenView = ({ onDataProcessed, initialData, setAppData, loadFestival }) => {
    const [startliste, setStartliste] = useState(initialData?.startliste || '');
    const [rangliste, setRangliste] = useState(initialData?.rangliste || '');
    const [festivalType, setFestivalType] = useState(initialData?.festivalType || 'normal');
    const [currentRound, setCurrentRound] = useState(initialData?.currentRound || 1);
    const [isDataLocked, setIsDataLocked] = useState(!!initialData);
    const [error, setError] = useState('');
    const [savedFestivals, setSavedFestivals] = useState([]);

    useEffect(() => {
        const festivals = JSON.parse(localStorage.getItem('savedFestivals') || '{}');
        setSavedFestivals(Object.keys(festivals));
    }, []);

    const handleProcess = () => {
        setError('');
        if (!startliste) { setError('Startliste wird benötigt.'); return; }
        if (currentRound > 1 && !rangliste) { setError(`Für Gang ${currentRound} wird eine Rangliste benötigt.`); return; }

        try {
            const nameToNummer = new Map();
            startliste.split(/\r?\n/).forEach(line => {
                if (line.trim() === '') return;
                const parts = line.split(',');
                if (parts.length < 2) throw new Error(`Ungültiges Format in Startliste: "${line}"`);
                const nummer = parts.shift().trim();
                const rawName = parts.join(',').trim();
                const { name } = parseName(rawName);
                if (nameToNummer.has(name)) throw new Error(`Doppelter Name in Startliste: ${name}`);
                nameToNummer.set(name, { nummer });
            });

            const processedData = new Map();
            if (currentRound > 1) {
                rangliste.split(/\r?\n/).forEach(line => {
                    if (line.trim() === '') return;
                    const parts = line.split(',');
                    if (parts.length < 2) throw new Error(`Ungültiges Format in Rangliste: "${line}"`);
                    const punkteStr = parts.shift().trim();
                    const rawNameFromRang = parts.join(',').trim();
                    const { name, sterne } = parseName(rawNameFromRang);
                    const startlistenEintrag = nameToNummer.get(name);
                    if (!startlistenEintrag) throw new Error(`Schwinger "${name}" aus Rangliste nicht in Startliste gefunden.`);
                    const punkteFloat = parseFloat(punkteStr.replace(',', '.'));
                    if (isNaN(punkteFloat)) throw new Error(`Ungültige Punktzahl für ${name}`);
                    processedData.set(startlistenEintrag.nummer, { nummer: startlistenEintrag.nummer, name, sterne, punkteBasis: punkteFloat, punkteGaenge: Array(8).fill(null), total: punkteFloat });
                });
            } else { // Gang 1
                startliste.split(/\r?\n/).forEach(line => {
                    if (line.trim() === '') return;
                    const parts = line.split(',');
                    const nummer = parts.shift().trim();
                    const rawName = parts.join(',').trim();
                    const { name, sterne } = parseName(rawName);
                    processedData.set(nummer, { nummer, name, sterne, punkteBasis: 0, punkteGaenge: Array(8).fill(null), total: 0 });
                });
            }
            setIsDataLocked(true);
            onDataProcessed({ schwingerData: processedData, festivalType, currentRound, startliste, rangliste });
        } catch (err) {
            setError(err.message);
        }
    };
    
    const handleUnlock = () => { setIsDataLocked(false); setError(''); setAppData(null); localStorage.removeItem('currentFestival'); };
    const roundOptions = festivalType === 'esaf' ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6];

    return (
        <div className="p-4 space-y-6">
            <h2 className="text-2xl font-bold">Startdaten</h2>
            <div className="grid grid-cols-2 gap-4">
                <select value={festivalType} onChange={e => setFestivalType(e.target.value)} disabled={isDataLocked} className="w-full p-2 border rounded-md disabled:bg-gray-100"><option value="normal">Normal (6 Gänge)</option><option value="esaf">ESAF (8 Gänge)</option></select>
                <select value={currentRound} onChange={e => setCurrentRound(parseInt(e.target.value))} disabled={isDataLocked} className="w-full p-2 border rounded-md disabled:bg-gray-100">{roundOptions.map(r => <option key={r} value={r}>{r}. Gang</option>)}</select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Startliste</label>
                <textarea value={startliste} onChange={e => setStartliste(e.target.value)} disabled={isDataLocked} rows="5" placeholder={"Format: Nummer, Name ***\n1, Giger Samuel ***\n2, Orlik Armon *"} className="w-full p-2 border rounded-md disabled:bg-gray-100"></textarea>
            </div>
            {currentRound > 1 && <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rangliste (nach Gang {currentRound - 1})</label>
                <textarea value={rangliste} onChange={e => setRangliste(e.target.value)} disabled={isDataLocked} rows="5" placeholder={"Format: Punkte, Name ***\n48.75, Giger Samuel ***\n48.50, Orlik Armon *"} className="w-full p-2 border rounded-md disabled:bg-gray-100"></textarea>
            </div>}
            {error && <p className="text-red-600 bg-red-100 p-3 rounded-md">{error}</p>}
            {!isDataLocked && <button onClick={handleProcess} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700">Daten verarbeiten</button>}
            {isDataLocked && <button onClick={handleUnlock} className="w-full bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600">Entsperren und Ändern</button>}
            
            <div className="bg-gray-100 p-4 rounded-lg">
                <h3 className="font-bold mb-2">Verlauf</h3>
                {savedFestivals.length > 0 ? (
                    <div className="space-y-2">
                        {savedFestivals.map(name => <button key={name} onClick={() => loadFestival(name)} className="w-full text-left p-2 bg-white rounded shadow-sm hover:bg-gray-50">{name}</button>)}
                    </div>
                ) : <p className="text-sm text-gray-500">Keine gespeicherten Schwingfeste.</p>}
            </div>
        </div>
    );
};

const Kranzrechner = ({ currentScore, roundsRemaining, targets }) => {
    const getNeededResultForOneRound = (targetScore) => {
        const needed = targetScore - currentScore;
        for (const result of POSSIBLE_RESULTS) { if (result.score >= needed) return result; }
        return null;
    };
    const getNeededResultForTwoRounds = (targetScore) => {
        const needed = targetScore - currentScore;
        for (const r1 of POSSIBLE_RESULTS) { for (const r2 of POSSIBLE_RESULTS) { if (r1.score + r2.score >= needed) return { r1, r2 }; } }
        return null;
    };
    const calculator = roundsRemaining === 1 ? getNeededResultForOneRound : getNeededResultForTwoRounds;
    return (
        <div className="mt-2 text-xs space-y-1 bg-blue-50 p-2 rounded-md">
            {targets.map(target => {
                const result = calculator(target);
                let resultText;
                if (result) {
                    if (roundsRemaining === 1) { resultText = `${result.label} (${result.score.toFixed(2)})`; } 
                    else { resultText = `${result.r1.label} (${result.r1.score.toFixed(2)}) & ${result.r2.label} (${result.r2.score.toFixed(2)})`; }
                } else { resultText = <span className="text-gray-500">Nicht erreichbar</span>; }
                const targetDisplay = target === 74.75 ? "74.75*" : target.toFixed(2);
                return (<div key={target} className="flex justify-between"><span className="font-semibold">Für {targetDisplay}:</span><span>{resultText}</span></div>);
            })}
        </div>
    );
};

const GaengeView = ({ appData, setSchwingerData, history, setHistory, pairings, setPairings, setLastAdded, showKranzrechner, setShowKranzrechner, setUndoMessage }) => {
    const { schwingerData, currentRound, festivalType } = appData;
    const [numPairings, setNumPairings] = useState(4);

    const isKranzrechnerRelevant = (festivalType === 'normal' && (currentRound === 5 || currentRound === 6)) || (festivalType === 'esaf' && (currentRound === 7 || currentRound === 8));

    useEffect(() => {
        if (pairings.length !== numPairings) {
            setPairings(Array(numPairings).fill(null).map((_, i) => ({ id: i, s1: { nummer: '', note: '' }, s2: { nummer: '', note: '' }, error: null })));
        }
    }, [numPairings, pairings.length, setPairings]);

    const handlePairingChange = (platzId, schwingerKey, field, value) => {
        setPairings(prev => prev.map(p => p.id === platzId ? { ...p, [schwingerKey]: { ...p[schwingerKey], [field]: value }, error: null } : p));
    };

    const saveResult = (platzId) => {
        const pairing = pairings.find(p => p.id === platzId);
        const { s1: { nummer: s1Nummer }, s2: { nummer: s2Nummer }, s1, s2 } = pairing;
        if (!s1.nummer || !s2.nummer || !s1.note || !s2.note) { setPairings(prev => prev.map(p => p.id === platzId ? { ...p, error: "Alle Felder ausfüllen" } : p)); return; }
        const s1Data = schwingerData.get(s1Nummer);
        const s2Data = schwingerData.get(s2Nummer);
        if (s1Data?.punkteGaenge[currentRound - 1] || s2Data?.punkteGaenge[currentRound - 1]) { setPairings(prev => prev.map(p => p.id === platzId ? { ...p, error: "Schwinger hat bereits Resultat" } : p)); return; }
        setHistory(prev => [...prev, new Map(schwingerData)]);
        setLastAdded([s1Nummer, s2Nummer]);
        const newSchwingerData = new Map(schwingerData);
        const updateSchwinger = (nummer, noteVal) => {
            const schwinger = JSON.parse(JSON.stringify(newSchwingerData.get(nummer)));
            if (!schwinger) throw new Error(`Nummer ${nummer} nicht gefunden.`);
            const note = parseNoteValue(noteVal);
            schwinger.punkteGaenge[currentRound - 1] = note;
            schwinger.total = schwinger.punkteBasis + schwinger.punkteGaenge.reduce((sum, p) => sum + (p ? p.high : 0), 0);
            newSchwingerData.set(nummer, schwinger);
        };
        try {
            updateSchwinger(s1Nummer, s1.note);
            updateSchwinger(s2Nummer, s2.note);
            setSchwingerData(newSchwingerData);
            setPairings(prev => prev.map(p => p.id === platzId ? { ...p, s1: { nummer: '', note: '' }, s2: { nummer: '', note: '' }, error: null } : p));
        } catch (e) { alert(e.message); }
    };
    
    const undoLast = () => {
        if (history.length === 0) return;
        const lastState = history[history.length - 1];
        const lastSchwingerKeys = Array.from(schwingerData.keys()).filter(key => lastState.get(key)?.punkteGaenge[currentRound-1] === null && schwingerData.get(key)?.punkteGaenge[currentRound-1] !== null);
        if (lastSchwingerKeys.length === 2) {
            const s1 = schwingerData.get(lastSchwingerKeys[0]);
            const s2 = schwingerData.get(lastSchwingerKeys[1]);
            setUndoMessage(`Resultat für ${s1.name} & ${s2.name} rückgängig gemacht.`);
        }
        setSchwingerData(lastState);
        setHistory(prev => prev.slice(0, -1));
        setLastAdded([]);
    };
    const roundsRemaining = festivalType === 'normal' ? 7 - currentRound : 9 - currentRound;
    const kranzTargets = festivalType === 'esaf' ? KRANZ_TARGETS_ESAF : KRANZ_TARGETS_NORMAL;

    return (
        <div className="p-4 space-y-4">
            <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Gänge Eingabe (Gang {currentRound})</h2><button onClick={undoLast} disabled={history.length === 0} className="bg-yellow-500 text-white px-3 py-1 rounded-md disabled:bg-gray-400">Rückgängig</button></div>
            <div className="flex justify-between items-center">
                <select value={numPairings} onChange={e => setNumPairings(parseInt(e.target.value))} className="p-2 border rounded-md">{[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}</select>
                {isKranzrechnerRelevant && <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={showKranzrechner} onChange={() => setShowKranzrechner(!showKranzrechner)} className="h-4 w-4" /><span>Kranzrechner</span></label>}
            </div>
            <div className="space-y-6">
                {pairings.map(p => {
                    const s1Info = schwingerData.get(p.s1.nummer);
                    const s2Info = schwingerData.get(p.s2.nummer);
                    return (
                        <div key={p.id} className="bg-gray-100 p-4 rounded-lg shadow-sm">
                            <h3 className="font-bold mb-2">Platz {p.id + 1}</h3>
                            <div className="text-center my-2 font-semibold text-lg"><span className={s1Info ? '' : 'text-gray-400'}>{s1Info ? `${s1Info.name} ${s1Info.sterne} (${s1Info.total.toFixed(2)})` : 'Schwinger 1'}</span><span className="mx-2">---</span><span className={s2Info ? '' : 'text-gray-400'}>{s2Info ? `${s2Info.name} ${s2Info.sterne} (${s2Info.total.toFixed(2)})` : 'Schwinger 2'}</span></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1"><input type="number" placeholder="Nr. Schwinger 1" value={p.s1.nummer} onChange={e => handlePairingChange(p.id, 's1', 'nummer', e.target.value)} className="w-full p-2 border rounded-md" /><select value={p.s1.note} onChange={e => handlePairingChange(p.id, 's1', 'note', e.target.value)} className="w-full p-2 border rounded-md">{NOTE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select>{showKranzrechner && s1Info && <Kranzrechner currentScore={s1Info.total} roundsRemaining={roundsRemaining} targets={kranzTargets} />}</div>
                                <div className="space-y-1"><input type="number" placeholder="Nr. Schwinger 2" value={p.s2.nummer} onChange={e => handlePairingChange(p.id, 's2', 'nummer', e.target.value)} className="w-full p-2 border rounded-md" /><select value={p.s2.note} onChange={e => handlePairingChange(p.id, 's2', 'note', e.target.value)} className="w-full p-2 border rounded-md">{NOTE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select>{showKranzrechner && s2Info && <Kranzrechner currentScore={s2Info.total} roundsRemaining={roundsRemaining} targets={kranzTargets} />}</div>
                            </div>
                            <button onClick={() => saveResult(p.id)} className={`mt-3 w-full text-white py-2 rounded-md transition-colors ${p.error ? 'bg-red-500' : 'bg-green-600 hover:bg-green-700'}`}>{p.error || 'Speichern'}</button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SimpleRangliste = ({ title, schwingerList, showNummer = false }) => (
    <div className="p-4"><h2 className="text-2xl font-bold text-center mb-4">{title}</h2><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rang</th>{showNummer && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>}<th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{schwingerList.map((s, index) => <tr key={s.nummer}><td className="px-3 py-2 whitespace-nowrap">{s.initialRankDisplay}</td>{showNummer && <td className="px-3 py-2 whitespace-nowrap">{s.nummer}</td>}<td className="px-3 py-2 whitespace-nowrap font-medium">{s.name} <span className="text-gray-400">{s.sterne}</span></td><td className="px-3 py-2 whitespace-nowrap font-bold text-blue-600">{s.total.toFixed(2)}</td></tr>)}</tbody></table></div></div>
);

const LineRow = ({ text, colorClass }) => <tr className="bg-gray-50"><td colSpan="4" className={`text-center py-1 text-sm font-semibold border-y ${colorClass}`}>{text}</td></tr>;
const EmptyRow = ({ rank }) => <tr className="bg-gray-50"><td className="px-3 py-2 text-gray-400">{rank}</td><td colSpan="3" className="px-3 py-2 text-center text-gray-400 italic">...</td></tr>;

const RanglisteView = ({ appData, setSchwingerData, lastAdded }) => {
    const { schwingerData, festivalType, currentRound } = appData;
    const [editingSchwinger, setEditingSchwinger] = useState(null);
    const [ausstichLinie, setAusstichLinie] = useState('35.75');
    const [kranzausstichLinie, setKranzausstichLinie] = useState('54.25');
    const [kranzLinie, setKranzLinie] = useState(festivalType === 'esaf' ? '74.75' : '56.50');
    
    const competedSchwinger = useMemo(() => Array.from(schwingerData.values()).filter(s => s.punkteGaenge[currentRound - 1] !== null).sort((a, b) => b.total - a.total), [schwingerData, currentRound]);
    
    const showAusstich = (festivalType === 'normal' || festivalType === 'esaf') && currentRound === 4;
    const showSchlussgang = (festivalType === 'normal' && currentRound === 5) || (festivalType === 'esaf' && currentRound === 7);
    const showKranzausstich = festivalType === 'esaf' && currentRound === 6;
    const showKranz = (festivalType === 'normal' && currentRound === 6) || (festivalType === 'esaf' && currentRound === 8);
    
    const minKranzRank = showKranz ? Math.ceil(schwingerData.size * 0.15) : 0;
    const maxKranzRank = showKranz ? Math.ceil(schwingerData.size * 0.18) : 0;
    const kranzScoreThreshold = festivalType === 'esaf' ? 74.25 : 55.75;

    const handleEditSave = (nummer, newNote) => {
        const newSchwingerData = new Map(schwingerData);
        const schwinger = JSON.parse(JSON.stringify(newSchwingerData.get(nummer)));
        const note = parseNoteValue(newNote);
        schwinger.punkteGaenge[currentRound - 1] = note;
        schwinger.total = schwinger.punkteBasis + schwinger.punkteGaenge.reduce((sum, p) => sum + (p ? p.high : 0), 0);
        newSchwingerData.set(nummer, schwinger);
        setSchwingerData(newSchwingerData);
        setEditingSchwinger(null);
    };

    const handleDelete = (nummer) => {
        const newSchwingerData = new Map(schwingerData);
        const schwinger = JSON.parse(JSON.stringify(newSchwingerData.get(nummer)));
        schwinger.punkteGaenge[currentRound - 1] = null;
        schwinger.total = schwinger.punkteBasis + schwinger.punkteGaenge.reduce((sum, p) => sum + (p ? p.high : 0), 0);
        newSchwingerData.set(nummer, schwinger);
        setSchwingerData(newSchwingerData);
        setEditingSchwinger(null);
    };

    const renderTableRows = () => {
        let rows = [];
        let lastTotal = Infinity;
        let lineFlags = { ausstich: false, kranzausstich: false, kranz: false, minKranz: false, maxKranz: false };
        
        const kranzAnwaerter = showKranz ? competedSchwinger.filter(s => s.total > kranzScoreThreshold) : competedSchwinger;
        const rest = showKranz ? competedSchwinger.filter(s => s.total <= kranzScoreThreshold) : [];
        
        const renderSchwingerRows = (schwingerList, isAnwaerter) => {
            schwingerList.forEach((s, index) => {
                const globalIndex = isAnwaerter ? index : kranzAnwaerter.length + index;
                const fullList = [...kranzAnwaerter, ...rest];
                const { rank, display } = getDynamicRankDisplay(fullList, globalIndex);

                if (showAusstich && ausstichLinie !== '0' && lastTotal >= parseFloat(ausstichLinie) && s.total < parseFloat(ausstichLinie)) { rows.push(<LineRow key={`ausstich-${s.nummer}`} text={`--- Ausstichlinie (${ausstichLinie.replace('*','')}) ---`} colorClass="text-red-600 border-red-400" />); lineFlags.ausstich = true; }
                if (showKranzausstich && kranzausstichLinie !== '0' && lastTotal >= parseFloat(kranzausstichLinie) && s.total < parseFloat(kranzausstichLinie)) { rows.push(<LineRow key={`kranzausstich-${s.nummer}`} text={`--- Kranzausstichlinie (${kranzausstichLinie.replace('*','')}) ---`} colorClass="text-red-600 border-red-400" />); lineFlags.kranzausstich = true; }
                if (showKranz && kranzLinie !== '0' && lastTotal >= parseFloat(kranzLinie) && s.total < parseFloat(kranzLinie)) { rows.push(<LineRow key={`kranz-${s.nummer}`} text={`--- Kranzlinie (${kranzLinie.replace('*','')}) ---`} colorClass="text-blue-600 border-blue-400" />); lineFlags.kranz = true; }
                
                rows.push(<tr key={s.nummer} onClick={() => setEditingSchwinger(s)} className={`cursor-pointer hover:bg-gray-100 ${lastAdded.includes(s.nummer) ? 'bg-green-200' : ''}`}><td className="px-3 py-2 whitespace-nowrap">{display}</td><td className="px-3 py-2 whitespace-nowrap font-medium">{s.name} <span className="text-gray-400">{s.sterne}</span></td><td className="px-3 py-2 whitespace-nowrap">{s.punkteGaenge[currentRound - 1]?.display || '-'}</td><td className="px-3 py-2 whitespace-nowrap font-bold text-blue-600">{s.total.toFixed(2)}</td></tr>);
                
                const nextSchwinger = fullList[globalIndex + 1];
                const isLastOfRank = !nextSchwinger || nextSchwinger.total !== s.total;

                if (showSchlussgang && isLastOfRank) {
                    const rank1Count = fullList.filter(schw => getDynamicRankDisplay(fullList, fullList.indexOf(schw)).rank === 1).length;
                    if (rank === 1 && rank1Count >= 2) rows.push(<LineRow key={`schlussgang-${s.nummer}`} text={`--- Schlussgangkandidaten ---`} colorClass="text-green-600 border-green-400" />);
                    if (rank === 2 && rank1Count < 2) rows.push(<LineRow key={`schlussgang-${s.nummer}`} text={`--- Schlussgangkandidaten ---`} colorClass="text-green-600 border-green-400" />);
                }

                if (showKranz && isLastOfRank && isAnwaerter) {
                    if (globalIndex + 1 === minKranzRank) { rows.push(<LineRow key={`min-kranz-${s.nummer}`} text={`--- Min. Kränze (${minKranzRank}) ---`} colorClass="text-green-600 border-green-400" />); lineFlags.minKranz = true; }
                    if (globalIndex + 1 === maxKranzRank) { rows.push(<LineRow key={`max-kranz-${s.nummer}`} text={`--- Max. Kränze (${maxKranzRank}) ---`} colorClass="text-red-600 border-red-400" />); lineFlags.maxKranz = true; }
                }
                lastTotal = s.total;
            });
        };
        
        renderSchwingerRows(kranzAnwaerter, true);

        if (showKranz) {
            const placeholders = [];
            const neededPlaceholders = maxKranzRank - kranzAnwaerter.length;
            if (neededPlaceholders > 0) {
                const lastSchwinger = kranzAnwaerter.length > 0 ? kranzAnwaerter[kranzAnwaerter.length - 1] : null;
                const lastRankInfo = lastSchwinger ? getDynamicRankDisplay(kranzAnwaerter, kranzAnwaerter.length - 1) : { rank: 0 };
                
                for (let i = 0; i < neededPlaceholders; i++) {
                    const personIndex = kranzAnwaerter.length + i + 1;
                    const rankDisplay = `${lastRankInfo.rank + i + 1}a`;
                    
                    placeholders.push(<EmptyRow key={`ph-${i}`} rank={rankDisplay} />);
                    
                    if (personIndex === minKranzRank) { placeholders.push(<LineRow key={`min-kranz-ph`} text={`--- Min. Kränze (${minKranzRank}) ---`} colorClass="text-green-600 border-green-400" />); lineFlags.minKranz = true; }
                    if (personIndex === maxKranzRank) { placeholders.push(<LineRow key={`max-kranz-ph`} text={`--- Max. Kränze (${maxKranzRank}) ---`} colorClass="text-red-600 border-red-400" />); lineFlags.maxKranz = true; }
                }
                rows.push(...placeholders);
            }
        }
        
        renderSchwingerRows(rest, false);

        if (showAusstich && ausstichLinie !== '0' && !lineFlags.ausstich) rows.push(<LineRow key="ausstich-end" text={`--- Ausstichlinie (${ausstichLinie.replace('*','')}) ---`} colorClass="text-red-600 border-red-400" />);
        if (showKranzausstich && kranzausstichLinie !== '0' && !lineFlags.kranzausstich) rows.push(<LineRow key="kranzausstich-end" text={`--- Kranzausstichlinie (${kranzausstichLinie.replace('*','')}) ---`} colorClass="text-red-600 border-red-400" />);
        if (showKranz && kranzLinie !== '0' && !lineFlags.kranz) rows.push(<LineRow key="kranz-end" text={`--- Kranzlinie (${kranzLinie.replace('*','')}) ---`} colorClass="text-blue-600 border-blue-400" />);
        if (showKranz && !lineFlags.maxKranz) rows.push(<LineRow key="max-kranz-end" text={`--- Max. Kränze (${maxKranzRank}) ---`} colorClass="text-red-600 border-red-400" />);
        if (showKranz && !lineFlags.minKranz) rows.push(<LineRow key="min-kranz-end" text={`--- Min. Kränze (${minKranzRank}) ---`} colorClass="text-green-600 border-green-400" />);
        
        return rows;
    };

    const kranzOptions = festivalType === 'esaf' 
        ? [<option value="0">Keine</option>, <option value="75.00">75.00</option>, <option value="74.75">74.75*</option>, <option value="74.50">74.50</option>]
        : [<option value="0">Keine</option>, <option value="56.50">56.50*</option>, <option value="56.25">56.25</option>, <option value="56.00">56.00</option>];

    return (
        <div className="p-4">
            {editingSchwinger && <EditNoteModal schwinger={editingSchwinger} onSave={handleEditSave} onDelete={handleDelete} onClose={() => setEditingSchwinger(null)} currentRound={currentRound} />}
            <h2 className="text-2xl font-bold text-center mb-2">Live-Rangliste</h2>
            <div className="flex justify-end items-center space-x-4 mb-4">
                {showKranz && <div className="text-sm text-gray-600">Kränze: {minKranzRank}-{maxKranzRank}</div>}
                {showAusstich && <div className="flex items-center space-x-2"><label className="text-sm">Ausstichlinie:</label><select value={ausstichLinie} onChange={e => setAusstichLinie(e.target.value)} className="p-1 border rounded"><option value="0">Keine</option><option value="36.00">36.00</option><option value="35.75">35.75*</option><option value="35.50">35.50</option></select></div>}
                {showKranzausstich && <div className="flex items-center space-x-2"><label className="text-sm">Kranzausstich:</label><select value={kranzausstichLinie} onChange={e => setKranzausstichLinie(e.target.value)} className="p-1 border rounded"><option value="0">Keine</option><option value="54.50">54.50</option><option value="54.25">54.25*</option></select></div>}
                {showKranz && <select value={kranzLinie} onChange={e => setKranzLinie(e.target.value)} className="p-1 border rounded">{kranzOptions}</select>}
            </div>
            <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rang</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Note G.{currentRound}</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{renderTableRows()}</tbody></table></div>
        </div>
    );
};

const EditNoteModal = ({ schwinger, onSave, onDelete, onClose, currentRound }) => {
    const [note, setNote] = useState(schwinger.punkteGaenge[currentRound - 1]?.display || '');
    const [confirmDelete, setConfirmDelete] = useState(false);
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm"><h3 className="text-lg font-bold mb-2">Resultat bearbeiten</h3><p className="mb-4">{schwinger.name} {schwinger.sterne}</p><label className="block text-sm font-medium">Note</label><select value={note} onChange={e => setNote(e.target.value)} className="w-full p-2 border rounded-md mb-4">{NOTE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select><div className="flex justify-between items-center">
                {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 bg-red-500 text-white rounded-md">Löschen</button>
                ) : (
                    <button onClick={() => onDelete(schwinger.nummer)} className="px-4 py-2 bg-red-700 text-white rounded-md">Wirklich löschen?</button>
                )}
                <div className="space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md">Abbrechen</button>
                    <button onClick={() => onSave(schwinger.nummer, note)} className="px-4 py-2 bg-blue-600 text-white rounded-md">Speichern</button>
                </div>
            </div>
        </div></div>
    );
};

export default function App() {
    const [currentView, setCurrentView] = useState('startdaten');
    const [appData, setAppData] = useState(null);
    const [history, setHistory] = useState([]);
    const [pairings, setPairings] = useState([]);
    const [lastAdded, setLastAdded] = useState([]);
    const [showKranzrechner, setShowKranzrechner] = useState(false);
    const [undoMessage, setUndoMessage] = useState('');

    // Load last session on startup
    useEffect(() => {
        try {
            const savedState = localStorage.getItem('currentFestival');
            if (savedState) {
                const parsed = JSON.parse(savedState);
                // Convert plain object back to Map
                parsed.appData.schwingerData = new Map(Object.entries(parsed.appData.schwingerData));
                setAppData(parsed.appData);
                setHistory(parsed.history.map(h => new Map(Object.entries(h))));
                setPairings(parsed.pairings);
                setShowKranzrechner(parsed.showKranzrechner);
                setCurrentView(parsed.currentView || 'zwischenrangliste');
            }
        } catch (e) {
            console.error("Could not load saved state:", e);
            localStorage.removeItem('currentFestival');
        }
    }, []);

    // Save state on change
    useEffect(() => {
        if (appData) {
            const stateToSave = {
                appData: { ...appData, schwingerData: Object.fromEntries(appData.schwingerData) },
                history: history.map(h => Object.fromEntries(h)),
                pairings,
                showKranzrechner,
                currentView
            };
            localStorage.setItem('currentFestival', JSON.stringify(stateToSave));
        }
    }, [appData, history, pairings, showKranzrechner, currentView]);
    
    // Handle undo message display
    useEffect(() => {
        if (undoMessage) {
            const timer = setTimeout(() => setUndoMessage(''), 2000);
            return () => clearTimeout(timer);
        }
    }, [undoMessage]);

    const handleDataProcessed = (data) => {
        const { schwingerData } = data;
        const sortedInitial = Array.from(schwingerData.values()).sort((a, b) => b.total - a.total);
        sortedInitial.forEach((s, index) => {
            const { rank, display } = getDynamicRankDisplay(sortedInitial, index);
            s.initialRank = rank;
            s.initialRankDisplay = display;
        });
        const updatedSchwingerData = new Map(sortedInitial.map(s => [s.nummer, s]));
        setAppData({ ...data, schwingerData: updatedSchwingerData });
        setCurrentView('zwischenrangliste');
    };

    const setSchwingerData = (newSchwingerData) => {
        setAppData(prev => ({ ...prev, schwingerData: newSchwingerData }));
    };

    const loadFestival = (name) => {
        const festivals = JSON.parse(localStorage.getItem('savedFestivals') || '{}');
        const festivalData = festivals[name];
        if (festivalData) {
            festivalData.appData.schwingerData = new Map(Object.entries(festivalData.appData.schwingerData));
            setAppData(festivalData.appData);
            setHistory(festivalData.history.map(h => new Map(Object.entries(h))));
            setPairings(festivalData.pairings);
            setShowKranzrechner(festivalData.showKranzrechner);
            setCurrentView(festivalData.currentView || 'zwischenrangliste');
        }
    };
    
    const renderView = () => {
        if (!appData) return <StartDatenView onDataProcessed={handleDataProcessed} initialData={appData} setAppData={setAppData} loadFestival={loadFestival} />;
        
        switch (currentView) {
            case 'startdaten': return <StartDatenView onDataProcessed={handleDataProcessed} initialData={appData} setAppData={setAppData} loadFestival={loadFestival} />;
            case 'zwischenrangliste':
                const uncompeted = Array.from(appData.schwingerData.values()).filter(s => s.punkteGaenge[appData.currentRound - 1] === null).sort((a, b) => {
                    if (a.total !== b.total) return b.total - a.total;
                    return a.initialRankDisplay.localeCompare(b.initialRankDisplay);
                });
                return <SimpleRangliste title={`Übersicht (nach Gang ${appData.currentRound - 1})`} schwingerList={uncompeted} showNummer={true} />;
            case 'gaenge': return <GaengeView appData={appData} setSchwingerData={setSchwingerData} history={history} setHistory={setHistory} pairings={pairings} setPairings={setPairings} setLastAdded={setLastAdded} showKranzrechner={showKranzrechner} setShowKranzrechner={setShowKranzrechner} setUndoMessage={setUndoMessage} />;
            case 'rangliste': return <RanglisteView appData={appData} setSchwingerData={setSchwingerData} lastAdded={lastAdded} />;
            default: return <StartDatenView onDataProcessed={handleDataProcessed} initialData={appData} setAppData={setAppData} loadFestival={loadFestival} />;
        }
    };

    return (
        <div className="bg-gray-100 min-h-screen pb-20">
            <header className="bg-white shadow-sm p-4 text-center"><h1 className="text-xl font-bold text-gray-800">Schwingen Pro</h1></header>
            <main className="container mx-auto max-w-4xl">
                {undoMessage && <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50">{undoMessage}</div>}
                {renderView()}
            </main>
            <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
        </div>
    );
}
