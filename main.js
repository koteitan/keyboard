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

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const activeNotes = {}; 
    let isMouseDown = false; 
    let currentMouseDownKey = null; // マウス操作で現在押下中のキー
    let currentTouchedKey = null; // タッチ操作で現在押下中のキー (または最後に触れたキー)

    // DynamicsCompressorNode のセットアップ
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, audioContext.currentTime); 
    compressor.knee.setValueAtTime(40, audioContext.currentTime);      
    compressor.ratio.setValueAtTime(12, audioContext.currentTime);     
    compressor.attack.setValueAtTime(0, audioContext.currentTime);     
    compressor.release.setValueAtTime(0.25, audioContext.currentTime); 
    // compressor.connect(audioContext.destination); // masterGainNode を経由するように変更

    // マスターボリューム用 GainNode
    const masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 0.5; // 初期値 (HTMLのrangeと合わせる)
    compressor.connect(masterGainNode);
    masterGainNode.connect(audioContext.destination);

    const masterVolumeSlider = document.getElementById('master-volume');
    const volumeDisplaySpan = document.getElementById('volume-display');

    function updateVolumeDisplay(value) {
        if (volumeDisplaySpan) {
            volumeDisplaySpan.textContent = `${Math.round(value * 100)}%`;
        }
    }

    if (masterVolumeSlider) { 
        // masterVolumeSlider.value は loadSettings で設定される
        // updateVolumeDisplay も loadSettings 内で呼ばれる
        masterVolumeSlider.addEventListener('input', (event) => {
            const newVolume = parseFloat(event.target.value);
            masterGainNode.gain.setValueAtTime(newVolume, audioContext.currentTime);
            updateVolumeDisplay(newVolume);
            localStorage.setItem(LS_KEYS.MASTER_VOLUME, newVolume.toString());
        });
    }


    let pianoSound;
    // piano.js のグローバルオブジェクト名を 'Piano' と仮定 (harmkey/piano.js の内容に基づく)
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
                } else if (attempts > 50) { // 5秒待つ
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
            // piano.jsのinitを呼び出す (audioContextを渡す)
            // piano.js側で出力先を compressor に変える必要があるが、ここではできない。
            // piano.js が直接 audioContext.destination につなぐため、ピアノの音はコンプレッサーを通らない。
            pianoSound.init(audioContext); 
        }
    });

    const keysLayout = [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.']
    ];

    const keyElements = {};
    let parsedAssignments = {}; // { key: "expressionString", ... }
    let evaluatedAssignments = {}; // { key: frequencyValue, ... } メモ化用

    // キーボード表示の生成
    keysLayout.forEach((row, rowIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('keyboard-row');

        // 画面幅に応じてインデントを調整
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

    function twelfthRootOfTwo(n) {
        return Math.pow(2, n / 12);
    }

    // --- 音律プリセット定義 ---
    // キーの並び: a, w, s, e, d, f, t, g, y, h, u, j, k (13キーで1オクターブ+1音をカバー)
    // C, C#, D, D#, E, F, F#, G, G#, A, A#, B, C'
    const presetKeys = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'];

    const tuningPresets = {
        "12tet": presetKeys.map((key, i) => `${key}=(2)^(${i}/12)`),
        "just": [ // 近似的な純正律 (Cメジャー基準)
            "a=1/1",      // C
            "w=16/15",    // C# (半音上) - ディアトニックな純正律ではC#の定義は複数ありえる。これは一例。
            "s=9/8",      // D
            "e=6/5",      // D# (Eb)
            "d=5/4",      // E
            "f=4/3",      // F
            "t=45/32",    // F# (拡張六度などから。7/5も候補)
            "g=3/2",      // G
            "y=8/5",      // G# (Ab)
            "h=5/3",      // A
            "u=9/5",      // A# (Bb, 16/9も近い)
            "j=15/8",     // B
            "k=2/1"       // C'
        ],
        "pythagorean": presetKeys.map((key, i) => {
            // ピタゴラス音律は (3/2)^n を2の冪で正規化。C=0とする。
            // 0:C, 1:G, 2:D, 3:A, 4:E, 5:B, 6:F#, -1:F, -2:Bb, -3:Eb, -4:Ab, -5:Db, -6:Gb
            // awsedftgyhujk (C,C#,D,D#,E,F,F#,G,G#,A,A#,B,C') にマッピングするのは複雑。
            // 簡単のため、12TETの各音に最も近いピタゴラス音程を近似的に割り当てる。
            // C, D, E, F, G, A, B はピタゴラスで定義しやすい。半音は近似。
            // C=1, D=9/8, E=81/64, F=4/3, G=3/2, A=27/16, B=243/128
            // C# (Db)=256/243, D# (Eb)=32/27, F#=729/512, G# (Ab)=128/81, A# (Bb)=16/9
            // これは非常に複雑なので、主要な音のみ定義し、他は12TETの近似とするか、単純化する。
            // ここでは、Cメジャースケールのピタゴラス音程を基本に、他は12TETの近似で代用。
            let ratioStr = `(2)^(${i}/12)`; // デフォルトは12TET
            switch (i) { // i は 0=C, 1=C#, ... 12=C'
                case 0: ratioStr = "1/1"; break;     // C (a)
                case 2: ratioStr = "9/8"; break;     // D (s)
                case 4: ratioStr = "81/64"; break;   // E (d)
                case 5: ratioStr = "4/3"; break;     // F (f)
                case 7: ratioStr = "3/2"; break;     // G (g)
                case 9: ratioStr = "27/16"; break;    // A (h)
                case 11: ratioStr = "243/128"; break; // B (j)
                case 12: ratioStr = "2/1"; break;    // C' (k)
            }
            return `${key}=${ratioStr}`;
        }),
        "meantone": presetKeys.map((key, i) => { // 1/4コンマミーントーン (Eが純正5/4になるように調整)
            // (5/4)^(1/4) を1ステップとする。C基準。
            // C-Gが純正3/2より少し狭い。
            // C=0, C#=1, D=2, D#=3, E=4 ...
            // E (4ステップ目) = 5/4
            // 1ステップの比率 r は r^4 = 5/4 なので r = (5/4)^(1/4)
            // i ステップ目は r^i = ((5/4)^(1/4))^i = (5/4)^(i/4)
            // ただし、これは長3度を4分割する考え方。大全音を2分割するのが一般的。
            // 大全音Tの比率は sqrt(5)/2。半音Sの比率は (2/T)^(1/3) * T とか複雑。
            // もっと簡単な近似: 12音中、主要な長3度が純正になるように。
            // C-E, F-A, G-B が 5/4。
            // ここでは、各音を ( (5)^(1/4) )^n で近似。nはCからのステップ数。
            // C=0, C#=1, D=2, E=3, F=4 ... (これは誤り。Eは4ステップ目)
            // (2^(n/12)) を基本に、E, A, Bなどを調整する方が簡単か。
            // E = 5/4, A = 5/3 (これは純正律に近い), B = 15/8
            // ここでは簡易的に、Eが5/4になるように調整した12音の近似値を生成。
            // 12音のミーントーンの近似値 (C=0):
            const r_m = Math.pow(5, 1/4); // 約1.495. これを4ステップで長3度とする。
                                        // 12音に拡張するのは複雑。
            // 簡単のため、主要な音のみ定義し、他は12TETの近似で代用。
            let ratioStr = `(2)^(${i}/12)`; // デフォルトは12TET
             switch (i) {
                case 0: ratioStr = "1/1"; break;    // C
                case 4: ratioStr = "5/4"; break;    // E (d)
                // 他の音もミーントーンの比率で定義するのは複雑なので、ここではEのみ純正に。
                // F=(4/3), G=(3/2)などは12TETと大きくずれる。
                // 典型的な1/4コンマミーントーンのCからの比率 (近似値)
                // C:1, C#:0.076, D:0.193, Eb:0.310, E:0.386 (5/4=1.25, 12TET E=1.26)
                // 実際の比率 (C=1): D=sqrt(5)/2, E=5/4, F=(5/4)/(sqrt(5)/2) ...
                // ここでは非常に単純化して、Eのみ5/4、他は12TETとする。
            }
            return `${key}=${ratioStr}`;
        }),
        "31tet": presetKeys.map((key, i) => `${key}=(2)^(${Math.round(i*31/12)}/31)`), // 12TETの音に最も近い31TETの音
        "53tet": presetKeys.map((key, i) => `${key}=(2)^(${Math.round(i*53/12)}/53)`), // 12TETの音に最も近い53TETの音
        "bp": [ // ボーレン・ピアース (13音でトリターブ 3/1) - キーマッピングは仮
                // BPスケールは通常13音。awsedftgyhujk (13キー) にそのまま割り当て。
                // 各ステップは (3)^(n/13)
                // これは基準周波数に対する絶対比なので、そのまま使える。
            "a=(3)^(0/13)", "w=(3)^(1/13)", "s=(3)^(2/13)", "e=(3)^(3/13)", "d=(3)^(4/13)",
            "f=(3)^(5/13)", "t=(3)^(6/13)", "g=(3)^(7/13)", "y=(3)^(8/13)", "h=(3)^(9/13)",
            "u=(3)^(10/13)", "j=(3)^(11/13)", "k=(3)^(12/13)"
        ]
    };

    function applyTuningPreset(presetName, saveToLs = true) {
        const preset = tuningPresets[presetName];
        if (preset && assignmentTextArea) { // assignmentTextAreaの存在も確認
            assignmentTextArea.value = preset.join('\n');
            if (saveToLs) {
                localStorage.setItem(LS_KEYS.TUNING_PRESET, presetName);
                localStorage.setItem(LS_KEYS.ASSIGNMENTS, assignmentTextArea.value); 
            }
            updateAssignmentsFromTextArea(); 
            updateDisabledKeysStatus();      
        }
    }

    if (tuningPresetSelect) { // 要素が存在することを確認
        tuningPresetSelect.addEventListener('change', (event) => {
            applyTuningPreset(event.target.value, true);
            // applyTuningPreset内でテキストエリアの内容も更新・保存される
        });
    }


    function setInitialAssignments() {
        // LocalStorageから読み込む前に、UI要素のデフォルト値を設定しておく
        // これらの値は、LocalStorageに保存された値があれば上書きされる
        tuningPresetSelect.value = "12tet"; 
        // applyTuningPreset("12tet", false); // loadSettingsで処理するのでここでは不要かも
                                          // ただし、applyTuningPresetはtextareaを埋めるので、
                                          // LSにassignmentsがない場合の初期値として必要
    }


    function updateAssignmentsFromTextArea() { // saveToLs 引数を削除
        parsedAssignments = {};
        evaluatedAssignments = {}; // キャッシュをクリア
        if (!assignmentTextArea) return; // テキストエリアがない場合は何もしない
        const lines = assignmentTextArea.value.split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (line === '' || line.startsWith('#')) return; // 空行やコメントは無視
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const expression = parts.slice(1).join('=').trim();
                if (key && expression) {
                    parsedAssignments[key] = expression;
                } else if (key && !expression) { // key= のように式がない場合は未定義扱い
                    delete parsedAssignments[key];
                }
            }
        });
    }
    
    assignmentTextArea.addEventListener('input', () => {
        localStorage.setItem(LS_KEYS.ASSIGNMENTS, assignmentTextArea.value); // 手動変更をLSに保存
        updateAssignmentsFromTextArea(); 
        updateDisabledKeysStatus();
    });
    if (baseFrequencyInput) { // 要素が存在することを確認
        baseFrequencyInput.addEventListener('input', () => {
            evaluatedAssignments = {}; 
            updateDisabledKeysStatus(); 
            localStorage.setItem(LS_KEYS.BASE_FREQUENCY, baseFrequencyInput.value);
        });
    }
    if (oscillatorTypeSelect) { // 要素が存在することを確認
        oscillatorTypeSelect.addEventListener('change', (event) => {
            localStorage.setItem(LS_KEYS.OSCILLATOR_TYPE, event.target.value);
        });
    }


    function updateDisabledKeysStatus() {
        keysLayout.flat().forEach(keyChar => {
            if (keyElements[keyChar]) {
                const freq = getFrequency(keyChar); // これで評価が走り、キャッシュもされる
                if (freq === null || isNaN(freq) || !isFinite(freq) || freq <= 0) {
                    keyElements[keyChar].classList.add('disabled');
                } else {
                    keyElements[keyChar].classList.remove('disabled');
                }
            }
        });
    }

    function evaluateKeyFrequency(key, visitedKeys = new Set()) {
        if (evaluatedAssignments[key] !== undefined) {
            return evaluatedAssignments[key];
        }
        if (visitedKeys.has(key)) {
            console.error(`Circular dependency detected for key: ${key}`);
            return null; // 循環参照エラー
        }
        visitedKeys.add(key);

        const expressionString = parsedAssignments[key];
        if (expressionString === undefined) {
            // console.warn(`No assignment for key: ${key}`);
            visitedKeys.delete(key);
            return null; // アサインなし
        }

        const currentBaseFreq = parseFloat(baseFrequencyInput.value) || 440;
        
        // ExpressionParserに渡すコンテキストから 'base' を削除。パーサーは純粋な比率を計算する。
        const tempAssignmentsForParser = { ...parsedAssignments };
        // delete tempAssignmentsForParser['base']; // 'base' というキー名はもう使わない

        // delete tempAssignmentsForParser['base']; // 'base' というキー名はもう使わない

        // for (const eKey in evaluatedAssignments) { // このループは下のループに統合
        //     if (evaluatedAssignments.hasOwnProperty(eKey) && evaluatedAssignments[eKey] !== null && evaluatedAssignments[eKey] !== undefined) {
        //         // 評価済みの「比率」をコンテキストに入れる
        //         tempAssignmentsForParser[eKey] = evaluatedAssignments[eKey]; 
        //     }
        // }
        // evaluatedAssignments には最終周波数がキャッシュされている。 // このコメントは古い。今は比率がキャッシュされる。
        // ExpressionParser に渡すのは、他のキーの「式文字列」または「評価済みの比率」。
        // そのため、evaluateKeyFrequency が返す値を比率にし、getFrequency で最終的に baseFreq を乗算する形にする。
        // または、ExpressionParser が評価する assignments の値として、他のキーの「式文字列」のみを渡し、
        // 参照されたキーの評価はこの evaluateKeyFrequency を再帰的に呼び出す形にする。
        // (現在の ExpressionParser は assignments の値を直接評価しようとする)

        // === 設計変更 ===
        // evaluateKeyFrequency は「比率」を計算して返すようにする。
        // evaluatedAssignments にも「比率」をキャッシュする。
        // getFrequency で、この比率に baseFrequency を乗算する。
        // ExpressionParser に渡す tempAssignmentsForParser には、他のキーの「式文字列」または「評価済みの比率」を入れる。

        // 評価済みの「比率」をコンテキストに含める
        // (evaluatedAssignments が比率をキャッシュするようになったと仮定)
        for (const eKey in evaluatedAssignments) {
             if (evaluatedAssignments.hasOwnProperty(eKey) && 
                 evaluatedAssignments[eKey] !== null && 
                 evaluatedAssignments[eKey] !== undefined) {
                // tempAssignmentsForParser には、他のキーの評価済み「比率」を入れる
                tempAssignmentsForParser[eKey] = evaluatedAssignments[eKey]; 
            }
        }
        
        // ExpressionParser に渡す識別子評価コールバック
        const evaluateIdentifierCb = (identifierName, contextAssignments, visitedInChain) => {
            // contextAssignments は tempAssignmentsForParser と同じものが渡ってくるはず
            // visitedInChain は ExpressionParser 内の現在の評価チェーンの visitedKeys
            
            // 'base' は特別扱いしない (式に直接数値を書くか、他のキー経由で定義)
            // もし 'base' をキーワードとして使いたいなら、parsedAssignments に 'base' を含めないようにし、
            // ここで特別処理する。現状は 'base' も通常のキーとして扱われる。
            
            // 参照先のキーを評価 (evaluateKeyFrequency を再帰的に呼び出す)
            // この時、main.js側の visitedKeys (evaluateKeyFrequency の引数) を使う必要がある。
            // ExpressionParserから渡される visitedInChain は、パーサー内部の1回のparseAndEvaluate呼び出し内での循環検出用。
            // main.js側の evaluateKeyFrequency の visitedKeys は、キー間の依存関係全体の循環検出用。
            // ここでは、main.js側の visitedKeys (現在の evaluateKeyFrequency スコープの visitedKeys) を使う。
            return evaluateKeyFrequency(identifierName, visitedKeys); 
        };

        let ratio = null;
        try {
            ratio = ExpressionParser.parseAndEvaluate(
                expressionString, 
                tempAssignmentsForParser, // 他のキーの式や評価済み比率のコンテキスト
                0, // baseFrequency引数はパーサー内では未使用
                new Set(visitedKeys), // パーサー内部の評価チェーン用 visited (main.jsのvisitedKeysとは別)
                evaluateIdentifierCb
            );
        } catch (e) {
            console.error(`Error evaluating expression for key '${key}' ("${expressionString}"): ${e.message}`);
            evaluatedAssignments[key] = null;
            visitedKeys.delete(key);
            return null;
        }

        if (ratio !== null && !isNaN(ratio) && isFinite(ratio)) {
            evaluatedAssignments[key] = ratio; // 比率をキャッシュ
        } else {
            // 評価結果が無効な場合もエラーとして扱う
            if (ratio !== null) { // nullでないがNaNやInfinityの場合
                 console.error(`Invalid evaluation result for key '${key}' ("${expressionString}"): ${ratio}`);
            }
            evaluatedAssignments[key] = null; 
        }
        
        visitedKeys.delete(key);
        return evaluatedAssignments[key]; // 比率を返す
    }


    function getFrequency(key) {
        // evaluateKeyFrequency は比率を返すようになった
        let ratio = null;
        if (evaluatedAssignments.hasOwnProperty(key)) { // キャッシュ確認
            ratio = evaluatedAssignments[key];
        } else {
            // 新しい評価サイクルなので、トップレベルの visitedKeys は常に新しいSetで開始
            ratio = evaluateKeyFrequency(key, new Set());
        }

        if (ratio === null || isNaN(ratio) || !isFinite(ratio)) {
            return null;
        }
        const baseFreq = parseFloat(baseFrequencyInput.value) || 440;
        return ratio * baseFreq; // 比率に基準周波数を乗算
    }

    function playNote(key) {
        if (activeNotes[key]) return;

        const freq = getFrequency(key); // これは最終的な周波数
        if (freq === null || freq <= 0 || isNaN(freq) || !isFinite(freq)) {
            if (parsedAssignments[key] !== undefined) { 
                 console.warn(`Cannot play note for key ${key}. Final frequency evaluated to: ${freq}`);
            }
            return;
        }

        const oscillatorType = oscillatorTypeSelect.value;
        let noteSource;

        if (oscillatorType === 'sine') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain(); // 各サイン波に専用のGainNode
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
            
            // 初期ゲインは後で adjustVolume で設定されるので、ここでは控えめに設定するか、0でも良い
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); 
            
            oscillator.connect(gainNode);
            gainNode.connect(compressor); // Destinationをコンプレッサーに変更
            oscillator.start();
            noteSource = { oscillator, gainNode, type: 'sine' }; // type を追加
        } else if (oscillatorType === 'piano' && pianoSound && pianoSound.play) {
            // piano.js が返す sourceNode は内部で gainNode を持ち、audioContext.destination に直接接続される。
            // これを compressor に向けるには piano.js の変更が必要。
            // 現状ではピアノの音はコンプレッサーを通らない。
            const pianoSourceNode = pianoSound.play(freq); 
            if (pianoSourceNode) { 
                noteSource = { type: 'piano', frequency: freq, internalNode: pianoSourceNode };
            } else {
                console.warn(`Piano sound for key ${key} (freq: ${freq}) could not be initiated by piano.js.`);
                return; 
            }
        } else {
            if (oscillatorType === 'piano' && (!pianoSound || !pianoSound.play)) {
                 console.warn(`Piano sound system not available. Oscillator type: ${oscillatorType}`);
            } else {
                 console.warn(`Unsupported oscillator type: ${oscillatorType}`);
            }
            return;
        }

        activeNotes[key] = noteSource; 
        adjustVolume(); // 音追加後に音量調整
        if (keyElements[key]) {
            keyElements[key].classList.add('active');
        }
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
                noteInfo.oscillator.stop(audioContext.currentTime + 0.051); // rampの少し後
            } else if (noteInfo.type === 'piano' && pianoSound && pianoSound.stop) {
                pianoSound.stop(noteInfo.frequency); 
            }
            delete activeNotes[key];
            adjustVolume(); // 音削除後に音量調整
            if (keyElements[key]) {
                keyElements[key].classList.remove('active');
            }
        }
    }

    const MAX_GAIN_PER_NOTE_SINE = 0.5; // サイン波1音の最大ゲイン
    const MAX_TOTAL_SINE_GAIN = 1.0; // サイン波全体の目標最大合計ゲイン (コンプレッサーがあるので1.0でも大丈夫そう)

    function adjustVolume() {
        const sineNotes = Object.values(activeNotes).filter(note => note.type === 'sine');
        const numSineNotes = sineNotes.length;

        if (numSineNotes === 0) return;

        // 5音まではクリップしないように、という要望。
        // 1音の最大ゲインを 0.5 とすると、5音で 2.5 になりうる。
        // 全体の出力が 1.0 を超えないようにする。
        // 各音のゲイン = MIN(0.5, 1.0 / numSineNotes)
        // ただし、これだと音が急に小さくなりすぎる。
        // 5音までは許容し、それ以上で減衰させるか、
        // 常に合計が一定になるようにするか。
        // ここでは、5音までは各0.2、それ以上はさらに下げる。
        // または、最大同時発音数を5として、それ以上は鳴らさないか、古い音を消す。
        // 今回はゲイン調整のみ。
        // 7音以上で聞こえないとのことなので、ゲインが下がりすぎないように調整。
        // 各音のゲインは MAX_GAIN_PER_NOTE_SINE を超えず、
        // かつ、全サイン波のゲインの合計が MAX_TOTAL_SINE_GAIN を超えないようにする。
        // 単純に targetGain = MAX_TOTAL_SINE_GAIN / numSineNotes とすると、1音の時に MAX_TOTAL_SINE_GAIN になってしまう。
        // 1音の時は MAX_GAIN_PER_NOTE_SINE にしたい。
        
        let targetGainPerNote = MAX_GAIN_PER_NOTE_SINE; // デフォルトは1音の最大ゲイン
        if (numSineNotes > 0) {
            // 合計ゲインが MAX_TOTAL_SINE_GAIN を超えないように、各音のゲインをスケーリング
            // かつ、1音あたりのゲインが MAX_GAIN_PER_NOTE_SINE を超えないようにする
            targetGainPerNote = Math.min(MAX_GAIN_PER_NOTE_SINE, MAX_TOTAL_SINE_GAIN / numSineNotes);
        }
        
        // ピアノの音量はここでは制御できないので、サイン波のみ対象
        sineNotes.forEach(note => {
            if (note.gainNode && audioContext.state === 'running') {
                note.gainNode.gain.cancelScheduledValues(audioContext.currentTime);
                note.gainNode.gain.setValueAtTime(note.gainNode.gain.value, audioContext.currentTime); // 現在値から
                note.gainNode.gain.linearRampToValueAtTime(targetGainPerNote, audioContext.currentTime + 0.02); // 短時間で目標ゲインへ
            }
        });
    }


    document.addEventListener('keydown', (event) => {
        const keyChar = event.key.toLowerCase();
        let 반지름 = false; // ignoreEventのtypo修正

        const targetIsInputArea = event.target === assignmentTextArea || 
                                event.target === baseFrequencyInput || 
                                event.target.tagName === 'INPUT';
        
        if (targetIsInputArea) {
            반지름 = true;
        } else if (event.target.tagName === 'SELECT') {
            const isSoundKey = keysLayout.flat().includes(keyChar);
            // SELECT操作に関連する可能性のあるキー (スペースも含む)
            const isSelectOperationKey = ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'Tab'].includes(event.key) || 
                                         event.key.startsWith('F'); // F1-F12
            
            if (isSelectOperationKey) {
                반지름 = true; 
            } else if (isSoundKey) {
                반지름 = false; // 音を出すキーならイベントを処理
            } else {
                반지름 = true; // その他のキーは無視
            }
        }

        if (반지름) {
            return;
        }

        if (keysLayout.flat().includes(keyChar) && !event.repeat) {
            playNote(keyChar);
        }
    });

    document.addEventListener('keyup', (event) => {
        const keyChar = event.key.toLowerCase();
        let 반지름 = false;

        const targetIsInputArea = event.target === assignmentTextArea || 
                                event.target === baseFrequencyInput || 
                                event.target.tagName === 'INPUT';

        if (targetIsInputArea) {
            반지름 = true;
        } else if (event.target.tagName === 'SELECT') {
            const isSoundKey = keysLayout.flat().includes(keyChar);
            const isSelectOperationKey = ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'Tab'].includes(event.key) ||
                                         event.key.startsWith('F');
            
            if (isSelectOperationKey) {
                반지름 = true;
            } else if (isSoundKey) {
                반지름 = false;
            } else {
                반지름 = true;
            }
        }
        
        if (반지름) {
            return;
        }

        if (keysLayout.flat().includes(keyChar)) {
            stopNote(keyChar);
        }
    });

    // 全ての音を停止するヘルパー関数
    function stopAllNotes() {
        Object.keys(activeNotes).forEach(keyInMap => {
            stopNote(keyInMap);
        });
    }

    Object.values(keyElements).forEach(keyDiv => {
        const keyChar = keyDiv.dataset.key;
        keyDiv.addEventListener('mousedown', (event) => {
            event.preventDefault(); // デフォルトのドラッグ動作などを防ぐ
            isMouseDown = true;
            currentMouseDownKey = keyChar;
            // 他の音が鳴っていれば止める（ドラッグ開始前にクリアするイメージ）
            // ただし、クリックしたキーの音はこれから鳴らすので、止めないようにする。
            // 一旦全て止めてから鳴らすのがシンプル。
            stopAllNotes(); 
            playNote(keyChar);
        });

        keyDiv.addEventListener('mouseenter', () => {
            if (isMouseDown) {
                // マウスボタンが押されたまま他のキーに移動してきた場合
                // 現在のキーと異なるキーにmouseenterした場合のみ音を切り替える
                if (currentMouseDownKey !== keyChar || !activeNotes[keyChar]) {
                     stopAllNotes(); // 以前の音をすべて止める
                     playNote(keyChar);
                     currentMouseDownKey = keyChar; // 現在のキーを更新
                }
            }
        });

        keyDiv.addEventListener('mouseleave', () => {
            if (isMouseDown && activeNotes[keyChar]) {
                // マウスボタンが押されたままキーから離れた場合、その音を止める
                // ただし、すぐに別のキーに enter する場合は、そちらで新しい音が鳴るので、
                // ここで止めると音が途切れる可能性がある。
                // 一旦、このmouseleaveでのstopはコメントアウトして様子を見る。
                // stopNote(keyChar);
                // currentMouseDownKey = null; // 離れたのでリセット
            }
        });
    });

    // document全体でのmouseupで全ての音を止め、状態をリセット
    document.addEventListener('mouseup', () => {
        if (isMouseDown) {
            isMouseDown = false;
            // 少し遅れて音を止めることで、クリック感が残るようにする
            // setTimeout(stopAllNotes, 50); 
            // 即時停止の方が挙動としてわかりやすいかもしれない
            stopAllNotes();
            currentMouseDownKey = null;
        }
    });

    // --- タッチイベントの処理 ---
    let lastTouchMovedKey = null;

    Object.values(keyElements).forEach(keyDiv => {
        const keyChar = keyDiv.dataset.key;

        keyDiv.addEventListener('touchstart', (event) => {
            event.preventDefault(); // スクロールやズームなどのデフォルト動作を防ぐ
            // isMouseDown = true; // タッチ操作では別のフラグや状態管理を使う方が良いかも
                               // currentMouseDownKey もマウス専用とする
            currentTouchedKey = keyChar;
            stopAllNotes(); // 他の音を止める
            playNote(keyChar);
            // 複数の指でのタッチを考慮する場合、event.changedTouches を見る必要がある
        }, { passive: false }); // preventDefaultのためにpassive: falseが必要

        // touchmove 中にキーから指が離れたことを検知するのは難しいので、
        // touchmove で別のキーに移動したら音を切り替える。
        // touchend で全ての音を止める。

        // keyDiv に touchmove を設定すると、指がキーの外に出たことを検知しにくい。
        // keyboardDisplay 全体に touchmove を設定する方が良いかもしれない。
    });

    // keyboardDisplay 全体で touchmove を監視し、どのキーの上に指があるか判定
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
                    // 新しいキーに指が移動した
                    stopAllNotes();
                    playNote(keyCharOver);
                    currentTouchedKey = keyCharOver; // 現在タッチしているキーを更新
                    lastTouchMovedKey = keyCharOver;
                } else if (!keyCharOver && lastTouchMovedKey) {
                    // キーの外に指が移動した
                    // stopNote(lastTouchMovedKey); // ここで止めるとドラッグ中に音が途切れる
                    lastTouchMovedKey = null;
                }
            }
        }, { passive: false });

        keyboardDisplay.addEventListener('touchend', (event) => {
            event.preventDefault();
            // 最後の指が離れたら全ての音を止める
            // if (event.touches.length === 0) { // 最後の指が離れた場合
                 stopAllNotes();
                 currentTouchedKey = null;
                 lastTouchMovedKey = null;
            // }
        });

        keyboardDisplay.addEventListener('touchcancel', (event) => {
            event.preventDefault();
            stopAllNotes();
            currentTouchedKey = null;
            lastTouchMovedKey = null;
        });
    }


    // --- LocalStorage 関連 ---
    function loadSettingsFromLocalStorage() {
        const savedBaseFreq = localStorage.getItem(LS_KEYS.BASE_FREQUENCY);
        const savedOscType = localStorage.getItem(LS_KEYS.OSCILLATOR_TYPE);
        const savedMasterVol = localStorage.getItem(LS_KEYS.MASTER_VOLUME);
        const savedTuningPreset = localStorage.getItem(LS_KEYS.TUNING_PRESET) || "12tet"; // デフォルト値
        const savedAssignments = localStorage.getItem(LS_KEYS.ASSIGNMENTS);

        // 基本設定の復元 (UI要素が存在するか確認)
        if (baseFrequencyInput && savedBaseFreq !== null) {
            baseFrequencyInput.value = savedBaseFreq;
        }
        if (oscillatorTypeSelect && savedOscType !== null) {
            oscillatorTypeSelect.value = savedOscType;
        }
        if (masterVolumeSlider && masterGainNode && savedMasterVol !== null) {
            const vol = parseFloat(savedMasterVol);
            if (!isNaN(vol)) {
                masterVolumeSlider.value = vol.toString();
                masterGainNode.gain.setValueAtTime(vol, audioContext.currentTime);
                updateVolumeDisplay(vol);
            }
        }
        
        if (tuningPresetSelect) {
            tuningPresetSelect.value = savedTuningPreset;
        }

        if (assignmentTextArea) {
            if (savedAssignments !== null) { // 保存された手動アサインがあればそれをテキストエリアに設定
                assignmentTextArea.value = savedAssignments;
            } else { // 保存された手動アサインがない場合
                // tuningPresetSelect.value (LSから復元されたかデフォルトの"12tet") に基づいてプリセットを適用
                applyTuningPreset(tuningPresetSelect ? tuningPresetSelect.value : "12tet", false); 
            }
        }
        
        updateAssignmentsFromTextArea(); // テキストエリアの現在の内容で内部状態を更新
    }

    // --- 初期化処理 ---
    // setInitialAssignments(); // HTMLのvalue属性やJSの変数の初期値がデフォルトとなる。
                             // loadSettingsFromLocalStorageがそれを上書きし、必要ならプリセットを適用する。
    loadSettingsFromLocalStorage(); 
    updateDisabledKeysStatus(); 
});
