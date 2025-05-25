// LocalStorage Keys
const LS_KEYS = {
    ASSIGNMENTS: 'keyboardApp.assignments',
    BASE_FREQUENCY: 'keyboardApp.baseFrequency',
    OSCILLATOR_TYPE: 'keyboardApp.oscillatorType',
    MASTER_VOLUME: 'keyboardApp.masterVolume',
    TUNING_PRESET: 'keyboardApp.tuningPreset'
};

document.addEventListener('DOMContentLoaded', () => {
    const keyboardDisplay = document.getElementById('keyboard-display');
    const assignmentTextArea = document.getElementById('assignment-textarea');
    const baseFrequencyInput = document.getElementById('base-frequency');
    const oscillatorTypeSelect = document.getElementById('oscillator-type');
    const tuningPresetSelect = document.getElementById('tuning-preset');
    const masterVolumeSlider = document.getElementById('master-volume');
    const volumeDisplaySpan = document.getElementById('volume-display');
    const ratioDisplayTextArea = document.getElementById('ratio-display-textarea');
    const sortAssignmentsButton = document.getElementById('sort-assignments-button'); 
    const wrappingButton = document.getElementById('wrapping-button');
    const wrappingUnitInput = document.getElementById('wrapping-unit');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const activeNotes = {}; 
    let isMouseDown = false; 
    let currentMouseDownKey = null; 
    let currentTouchedKey = null; 

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, audioContext.currentTime); 
    compressor.knee.setValueAtTime(40, audioContext.currentTime);      
    compressor.ratio.setValueAtTime(12, audioContext.currentTime);     
    compressor.attack.setValueAtTime(0, audioContext.currentTime);     
    compressor.release.setValueAtTime(0.25, audioContext.currentTime); 

    const masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 0.5; 
    compressor.connect(masterGainNode);
    masterGainNode.connect(audioContext.destination);

    function updateVolumeDisplay(value) {
        if (volumeDisplaySpan) {
            volumeDisplaySpan.textContent = `${Math.round(value * 100)}%`;
        }
    }

    if (masterVolumeSlider) { 
        masterVolumeSlider.addEventListener('input', (event) => {
            const newVolume = parseFloat(event.target.value);
            masterGainNode.gain.setValueAtTime(newVolume, audioContext.currentTime);
            updateVolumeDisplay(newVolume);
            localStorage.setItem(LS_KEYS.MASTER_VOLUME, newVolume.toString());
        });
    }

    let pianoSound;
    const pianoGlobalObjectName = 'Piano'; 
    const pianoInitializationPromise = new Promise((resolve) => {
        if (typeof window[pianoGlobalObjectName] !== 'undefined' && 
            window[pianoGlobalObjectName].play && 
            typeof window[pianoGlobalObjectName].init === 'function') {
            resolve(window[pianoGlobalObjectName]);
        } else {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (typeof window[pianoGlobalObjectName] !== 'undefined' && 
                    window[pianoGlobalObjectName].play && 
                    typeof window[pianoGlobalObjectName].init === 'function') {
                    clearInterval(interval);
                    resolve(window[pianoGlobalObjectName]);
                } else if (attempts > 50) { 
                    clearInterval(interval);
                    console.error(`${pianoGlobalObjectName}.jsの読み込みまたは初期化に失敗しました。`);
                    resolve(null);
                }
            }, 100);
        }
    });

    pianoInitializationPromise.then(p => {
        pianoSound = p;
        if (pianoSound) {
            pianoSound.init(audioContext); 
        }
    });

    const keysLayout = [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.']
    ];

    const keyElements = {};
    let parsedAssignments = {}; 
    let evaluatedAssignments = {}; 

    keysLayout.forEach((row, rowIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('keyboard-row');
        const isSmallScreen = window.matchMedia("(max-width: 600px)").matches;
        const keyWidth = isSmallScreen ? 28 : 40;
        const keyMargin = isSmallScreen ? 3 : 5;
        const indentUnit = (keyWidth + keyMargin) / 2;
        if (rowIndex === 1) rowDiv.style.paddingLeft = `${indentUnit}px`;
        if (rowIndex === 2) rowDiv.style.paddingLeft = `${indentUnit * 2}px`;
        row.forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.classList.add('key');
            keyDiv.textContent = key;
            keyDiv.dataset.key = key;
            rowDiv.appendChild(keyDiv);
            keyElements[key] = keyDiv;
        });
        keyboardDisplay.appendChild(rowDiv);
    });

    const presetKeys = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'];
    const tuningPresets = {
        "12tet": presetKeys.map((key, i) => `${key}=(2)^(${i}/12)`),
        "just": ["a=1/1","w=16/15","s=9/8","e=6/5","d=5/4","f=4/3","t=45/32","g=3/2","y=8/5","h=5/3","u=9/5","j=15/8","k=2/1"],
        "pythagorean": presetKeys.map((key, i) => {
            let r = `(2)^(${i}/12)`; 
            switch (i) { 
                case 0: r="1/1"; break; case 2: r="9/8"; break; case 4: r="81/64"; break; case 5: r="4/3"; break;
                case 7: r="3/2"; break; case 9: r="27/16"; break; case 11: r="243/128"; break; case 12: r="2/1"; break;
            } return `${key}=${r}`;
        }),
        "meantone": presetKeys.map((key, i) => {
            let r = `(2)^(${i}/12)`; 
            switch (i) { case 0: r="1/1"; break; case 4: r="5/4"; break;} 
            return `${key}=${r}`;
        }),
        "31tet": presetKeys.map((key, i) => `${key}=(2)^(${Math.round(i*31/12)}/31)`),
        "53tet": presetKeys.map((key, i) => `${key}=(2)^(${Math.round(i*53/12)}/53)`),
        "bp": ["a=(3)^(0/13)","w=(3)^(1/13)","s=(3)^(2/13)","e=(3)^(3/13)","d=(3)^(4/13)","f=(3)^(5/13)","t=(3)^(6/13)","g=(3)^(7/13)","y=(3)^(8/13)","h=(3)^(9/13)","u=(3)^(10/13)","j=(3)^(11/13)","k=(3)^(12/13)"]
    };

    function applyTuningPreset(presetName, saveToLs = true) {
        const preset = tuningPresets[presetName];
        if (preset && assignmentTextArea) {
            assignmentTextArea.value = preset.join('\n');
            if (saveToLs) {
                localStorage.setItem(LS_KEYS.TUNING_PRESET, presetName);
                localStorage.setItem(LS_KEYS.ASSIGNMENTS, assignmentTextArea.value); 
            }
            updateAssignmentsFromTextArea(); 
            updateDisabledKeysStatusAndRatioDisplay();      
        }
    }

    if (tuningPresetSelect) {
        tuningPresetSelect.addEventListener('change', (event) => {
            applyTuningPreset(event.target.value, true);
        });
    }

    function updateAssignmentsFromTextArea() {
        parsedAssignments = {};
        evaluatedAssignments = {}; 
        if (!assignmentTextArea) return;
        const lines = assignmentTextArea.value.split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (line === '' || line.startsWith('#')) return;
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const expression = parts.slice(1).join('=').trim();
                if (key && expression) parsedAssignments[key] = expression;
                else if (key && !expression) delete parsedAssignments[key];
            }
            // キーなしexpressionのパースはここでは行わない (ユーザー指示により後で)
        });
    }
    
    if (assignmentTextArea) {
        assignmentTextArea.addEventListener('input', () => {
            localStorage.setItem(LS_KEYS.ASSIGNMENTS, assignmentTextArea.value); 
            updateAssignmentsFromTextArea(); 
            updateDisabledKeysStatusAndRatioDisplay();
        });
    }
    if (baseFrequencyInput) {
        baseFrequencyInput.addEventListener('input', () => {
            evaluatedAssignments = {}; 
            updateDisabledKeysStatusAndRatioDisplay(); 
            localStorage.setItem(LS_KEYS.BASE_FREQUENCY, baseFrequencyInput.value);
        });
    }
    if (oscillatorTypeSelect) {
        oscillatorTypeSelect.addEventListener('change', (event) => {
            localStorage.setItem(LS_KEYS.OSCILLATOR_TYPE, event.target.value);
        });
    }

    function updateRatioDisplay() {
        if (!ratioDisplayTextArea || !assignmentTextArea) return;
        const assignmentContent = assignmentTextArea.value;
        const assignmentLines = assignmentContent.split('\n');
        const displayLines = [];

        assignmentLines.forEach(line => {
            line = line.trim();
            if (line === '' || line.startsWith('#')) {
                return; 
            }
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                if (key && parsedAssignments[key]) {
                    const ratio = evaluateKeyFrequency(key, new Set());
                    if (ratio !== null && !isNaN(ratio) && isFinite(ratio)) {
                        displayLines.push(`${key} = ${ratio.toFixed(5)}`);
                    } else {
                        displayLines.push(`${key} = (エラーまたは未定義)`);
                    }
                } else if (key) {
                    displayLines.push(`${key} = (未定義)`);
                }
            } else if (line !== '') {
                 displayLines.push(line + " (無効な行)");
            }
        });
        ratioDisplayTextArea.value = displayLines.join('\n');
    }

    function updateDisabledKeysStatusAndRatioDisplay() {
        keysLayout.flat().forEach(keyChar => {
            if (keyElements[keyChar]) {
                const freq = getFrequency(keyChar); 
                if (freq === null || isNaN(freq) || !isFinite(freq) || freq <= 0) {
                    keyElements[keyChar].classList.add('disabled');
                } else {
                    keyElements[keyChar].classList.remove('disabled');
                }
            }
        });
        updateRatioDisplay();
    }

    function evaluateKeyFrequency(key, visitedKeys = new Set()) {
        if (evaluatedAssignments[key] !== undefined) return evaluatedAssignments[key];
        if (visitedKeys.has(key)) {
            console.error(`Circular dependency detected for key: ${key}`);
            return null;
        }
        visitedKeys.add(key);
        const expressionString = parsedAssignments[key];
        if (expressionString === undefined) {
            visitedKeys.delete(key);
            return null;
        }
        const tempAssignmentsForParser = { ...parsedAssignments };
        for (const eKey in evaluatedAssignments) {
             if (evaluatedAssignments.hasOwnProperty(eKey) && evaluatedAssignments[eKey] !== null && evaluatedAssignments[eKey] !== undefined) {
                tempAssignmentsForParser[eKey] = evaluatedAssignments[eKey]; 
            }
        }
        const evaluateIdentifierCb = (idName, _, vKeys) => evaluateKeyFrequency(idName, vKeys);
        let ratio = null;
        try {
            ratio = ExpressionParser.parseAndEvaluate(expressionString, tempAssignmentsForParser, 0, new Set(visitedKeys), evaluateIdentifierCb);
        } catch (e) {
            console.error(`Error evaluating for key '${key}' ("${expressionString}"): ${e.message}`);
            evaluatedAssignments[key] = null;
            visitedKeys.delete(key);
            return null;
        }
        if (ratio !== null && !isNaN(ratio) && isFinite(ratio)) evaluatedAssignments[key] = ratio;
        else {
            if (ratio !== null) console.error(`Invalid result for key '${key}' ("${expressionString}"): ${ratio}`);
            evaluatedAssignments[key] = null; 
        }
        visitedKeys.delete(key);
        return evaluatedAssignments[key];
    }

    function getFrequency(key) {
        let ratio = evaluatedAssignments.hasOwnProperty(key) ? evaluatedAssignments[key] : evaluateKeyFrequency(key, new Set());
        if (ratio === null || isNaN(ratio) || !isFinite(ratio)) return null;
        return ratio * (parseFloat(baseFrequencyInput.value) || 440);
    }

    function playNote(key) {
        if (activeNotes[key]) return;
        const freq = getFrequency(key);
        if (freq === null || freq <= 0 || isNaN(freq) || !isFinite(freq)) {
            if (parsedAssignments[key] !== undefined) console.warn(`Cannot play note for key ${key}. Freq: ${freq}`);
            return;
        }
        const oscillatorType = oscillatorTypeSelect.value;
        let noteSource;
        if (oscillatorType === 'sine') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); 
            oscillator.connect(gainNode);
            gainNode.connect(compressor);
            oscillator.start();
            noteSource = { oscillator, gainNode, type: 'sine' };
        } else if (oscillatorType === 'piano' && pianoSound && pianoSound.play) {
            const pianoSourceNode = pianoSound.play(freq); 
            if (pianoSourceNode) noteSource = { type: 'piano', frequency: freq, internalNode: pianoSourceNode };
            else { console.warn(`Piano sound for key ${key} (freq: ${freq}) failed.`); return; }
        } else {
            if (oscillatorType === 'piano' && (!pianoSound || !pianoSound.play)) console.warn(`Piano N/A. Type: ${oscillatorType}`);
            else console.warn(`Unsupported oscillator type: ${oscillatorType}`);
            return;
        }
        activeNotes[key] = noteSource; 
        adjustVolume(); 
        if (keyElements[key]) keyElements[key].classList.add('active');
    }

    function stopNote(key) {
        const noteInfo = activeNotes[key];
        if (noteInfo) {
            if (noteInfo.type === 'sine' && noteInfo.oscillator && noteInfo.gainNode) {
                const gainNode = noteInfo.gainNode;
                if (audioContext.state === 'running') {
                    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.05);
                }
                noteInfo.oscillator.stop(audioContext.currentTime + 0.051);
            } else if (noteInfo.type === 'piano' && pianoSound && pianoSound.stop) {
                pianoSound.stop(noteInfo.frequency); 
            }
            delete activeNotes[key];
            adjustVolume(); 
            if (keyElements[key]) keyElements[key].classList.remove('active');
        }
    }

    const MAX_GAIN_PER_NOTE_SINE = 0.5;
    const MAX_TOTAL_SINE_GAIN = 1.0; 
    function adjustVolume() {
        const sineNotes = Object.values(activeNotes).filter(note => note.type === 'sine');
        const numSineNotes = sineNotes.length;
        if (numSineNotes === 0) return;
        let targetGainPerNote = MAX_GAIN_PER_NOTE_SINE;
        if (numSineNotes > 0) targetGainPerNote = Math.min(MAX_GAIN_PER_NOTE_SINE, MAX_TOTAL_SINE_GAIN / numSineNotes);
        sineNotes.forEach(note => {
            if (note.gainNode && audioContext.state === 'running') {
                note.gainNode.gain.cancelScheduledValues(audioContext.currentTime);
                note.gainNode.gain.setValueAtTime(note.gainNode.gain.value, audioContext.currentTime);
                note.gainNode.gain.linearRampToValueAtTime(targetGainPerNote, audioContext.currentTime + 0.02);
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        const keyChar = event.key.toLowerCase();
        let ignoreEvent = false;
        const targetIsInputArea = event.target === assignmentTextArea || event.target === baseFrequencyInput || event.target.tagName === 'INPUT';
        if (targetIsInputArea) ignoreEvent = true;
        else if (event.target.tagName === 'SELECT') {
            const isSoundKey = keysLayout.flat().includes(keyChar);
            const isSelectOpKey = ['ArrowUp','ArrowDown','Enter',' ','Escape','Tab'].includes(event.key) || event.key.startsWith('F');
            if (isSelectOpKey) ignoreEvent = true; 
            else if (isSoundKey) ignoreEvent = false; 
            else ignoreEvent = true; 
        }
        if (ignoreEvent) return;
        if (keysLayout.flat().includes(keyChar) && !event.repeat) playNote(keyChar);
    });

    document.addEventListener('keyup', (event) => {
        const keyChar = event.key.toLowerCase();
        let ignoreEvent = false;
        const targetIsInputArea = event.target === assignmentTextArea || event.target === baseFrequencyInput || event.target.tagName === 'INPUT';
        if (targetIsInputArea) ignoreEvent = true;
        else if (event.target.tagName === 'SELECT') {
            const isSoundKey = keysLayout.flat().includes(keyChar);
            const isSelectOpKey = ['ArrowUp','ArrowDown','Enter',' ','Escape','Tab'].includes(event.key) || event.key.startsWith('F');
            if (isSelectOpKey) ignoreEvent = true;
            else if (isSoundKey) ignoreEvent = false;
            else ignoreEvent = true;
        }
        if (ignoreEvent) return;
        if (keysLayout.flat().includes(keyChar)) stopNote(keyChar);
    });

    function stopAllNotes() {
        Object.keys(activeNotes).forEach(keyInMap => stopNote(keyInMap));
    }

    Object.values(keyElements).forEach(keyDiv => {
        const keyChar = keyDiv.dataset.key;
        keyDiv.addEventListener('mousedown', (event) => {
            event.preventDefault(); 
            isMouseDown = true;
            currentMouseDownKey = keyChar;
            stopAllNotes(); 
            playNote(keyChar);
        });
        keyDiv.addEventListener('mouseenter', () => {
            if (isMouseDown && (currentMouseDownKey !== keyChar || !activeNotes[keyChar])) {
                stopAllNotes(); 
                playNote(keyChar);
                currentMouseDownKey = keyChar; 
            }
        });
    });

    document.addEventListener('mouseup', () => {
        if (isMouseDown) {
            isMouseDown = false;
            stopAllNotes();
            currentMouseDownKey = null;
        }
    });

    let lastTouchMovedKey = null;
    Object.values(keyElements).forEach(keyDiv => {
        const keyChar = keyDiv.dataset.key;
        keyDiv.addEventListener('touchstart', (event) => {
            event.preventDefault(); 
            currentTouchedKey = keyChar;
            stopAllNotes(); 
            playNote(keyChar);
        }, { passive: false });
    });

    if (keyboardDisplay) {
        keyboardDisplay.addEventListener('touchmove', (event) => {
            event.preventDefault();
            if (event.touches.length > 0) {
                const touch = event.touches[0];
                const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
                let keyCharOver = null;
                if (elementUnderTouch && elementUnderTouch.classList.contains('key')) {
                    keyCharOver = elementUnderTouch.dataset.key;
                }
                if (keyCharOver && keyCharOver !== lastTouchMovedKey) {
                    stopAllNotes();
                    playNote(keyCharOver);
                    currentTouchedKey = keyCharOver; 
                    lastTouchMovedKey = keyCharOver;
                } else if (!keyCharOver && lastTouchMovedKey) {
                    lastTouchMovedKey = null;
                }
            }
        }, { passive: false });
        const touchendOrCancel = (event) => {
            event.preventDefault();
            stopAllNotes();
            currentTouchedKey = null;
            lastTouchMovedKey = null;
        };
        keyboardDisplay.addEventListener('touchend', touchendOrCancel);
        keyboardDisplay.addEventListener('touchcancel', touchendOrCancel);
    }

    function loadSettingsFromLocalStorage() {
        const savedBaseFreq = localStorage.getItem(LS_KEYS.BASE_FREQUENCY);
        const savedOscType = localStorage.getItem(LS_KEYS.OSCILLATOR_TYPE);
        const savedMasterVol = localStorage.getItem(LS_KEYS.MASTER_VOLUME);
        const savedTuningPreset = localStorage.getItem(LS_KEYS.TUNING_PRESET) || "12tet"; 
        const savedAssignments = localStorage.getItem(LS_KEYS.ASSIGNMENTS);

        if (baseFrequencyInput && savedBaseFreq !== null) baseFrequencyInput.value = savedBaseFreq;
        if (oscillatorTypeSelect && savedOscType !== null) oscillatorTypeSelect.value = savedOscType;
        if (masterVolumeSlider && masterGainNode && savedMasterVol !== null) {
            const vol = parseFloat(savedMasterVol);
            if (!isNaN(vol)) {
                masterVolumeSlider.value = vol.toString();
                masterGainNode.gain.setValueAtTime(vol, audioContext.currentTime);
                updateVolumeDisplay(vol);
            }
        }
        if (tuningPresetSelect) tuningPresetSelect.value = savedTuningPreset;
        if (assignmentTextArea) {
            if (savedAssignments !== null) assignmentTextArea.value = savedAssignments;
            else applyTuningPreset(tuningPresetSelect ? tuningPresetSelect.value : "12tet", false); 
        }
        updateAssignmentsFromTextArea(); 
    }

    loadSettingsFromLocalStorage(); 
    updateDisabledKeysStatusAndRatioDisplay();

    if (sortAssignmentsButton && assignmentTextArea) {
        sortAssignmentsButton.addEventListener('click', () => {
            const currentParsed = { ...parsedAssignments }; 
            const evaluableAssignments = []; 
            const currentLines = assignmentTextArea.value.split('\n');
            const originalKeyOrder = []; 
            
            currentLines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine === '' || trimmedLine.startsWith('#')) return;
                const parts = trimmedLine.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const expression = parts.slice(1).join('=').trim();
                    if (key && expression && currentParsed.hasOwnProperty(key) && currentParsed[key] === expression) {
                        const ratio = evaluateKeyFrequency(key, new Set());
                        if (ratio !== null && isFinite(ratio)) {
                            evaluableAssignments.push({ key, expression, ratio });
                            if (!originalKeyOrder.includes(key)) { 
                                originalKeyOrder.push(key);
                            }
                        } else {
                            console.warn(`Key '${key}' (expr: "${expression}") excluded from sort due to evaluation error.`);
                        }
                    }
                }
            });

            evaluableAssignments.sort((a, b) => a.ratio - b.ratio);

            const newAssignmentsMap = {};
            for (let i = 0; i < evaluableAssignments.length; i++) {
                if (i < originalKeyOrder.length) {
                    const targetKey = originalKeyOrder[i]; 
                    newAssignmentsMap[targetKey] = evaluableAssignments[i].expression; 
                }
            }
            
            const resultLines = [];
            currentLines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine === '' || trimmedLine.startsWith('#')) {
                    resultLines.push(line); 
                    return;
                }
                const parts = trimmedLine.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    if (newAssignmentsMap.hasOwnProperty(key)) {
                        resultLines.push(`${key} = ${newAssignmentsMap[key]}`);
                    } else {
                        resultLines.push(line); 
                    }
                } else {
                    resultLines.push(line); 
                }
            });

            assignmentTextArea.value = resultLines.join('\n');
            localStorage.setItem(LS_KEYS.ASSIGNMENTS, assignmentTextArea.value);
            updateAssignmentsFromTextArea(); 
            updateDisabledKeysStatusAndRatioDisplay(); 
        });
    }

    if (wrappingButton && assignmentTextArea && wrappingUnitInput) {
        wrappingButton.addEventListener('click', () => {
            const w = parseFloat(wrappingUnitInput.value);
            if (isNaN(w) || w <= 0) {
                alert("ラッピング単位は正の数を入力してください。");
                return;
            }
            if (w === 1) {
                alert("ラッピング単位として1は使用できません（全ての比率が1になってしまいます）。");
                return;
            }

            const currentParsed = { ...parsedAssignments }; 
            const newLines = [];
            const originalLines = assignmentTextArea.value.split('\n');

            originalLines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine === '' || trimmedLine.startsWith('#')) {
                    newLines.push(line); 
                    return;
                }
                
                const parts = trimmedLine.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const originalExpression = parts.slice(1).join('=').trim(); 

                    if (key && originalExpression && currentParsed.hasOwnProperty(key) && currentParsed[key] === originalExpression) {
                        const ratio = evaluateKeyFrequency(key, new Set());

                        if (ratio !== null && isFinite(ratio) && ratio > 0) {
                            let k = 0;
                            let tempRatio = ratio;
                            if (w > 1) { 
                                while (tempRatio >= w) { tempRatio /= w; k++; }
                                while (tempRatio < 1 && tempRatio > 0) { 
                                    tempRatio *= w; k--;
                                    if (tempRatio < 1e-9 && k < -100) { tempRatio = 1; break; } 
                                }
                            }
                            
                            let newExpression = originalExpression;
                            if (k > 0) {
                                newExpression = `(${originalExpression}) / (${w}^${k})`;
                            } else if (k < 0) {
                                newExpression = `(${originalExpression}) * (${w}^${-k})`;
                            }
                            newLines.push(`${key} = ${newExpression}`);
                        } else {
                            newLines.push(line); 
                        }
                    } else {
                        newLines.push(line); 
                    }
                } else {
                    // キーなしexpressionはここでは処理しない (ユーザー指示により後で)
                    newLines.push(line); 
                }
            });
            
            assignmentTextArea.value = newLines.join('\n');
            localStorage.setItem(LS_KEYS.ASSIGNMENTS, assignmentTextArea.value);
            updateAssignmentsFromTextArea(); 
            updateDisabledKeysStatusAndRatioDisplay(); 
        });
    }
});
