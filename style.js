// スタイルは CSS で記述するため、このファイルは現時点では空です。
// 必要に応じて JavaScript で動的にスタイルを操作する場合に使用します。

// CSS でスタイルを指定するため、style.css を作成し、index.html から読み込むように変更することも検討できます。
// 今回は style.js のまま進めます。

document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        body {
            font-family: monospace, sans-serif; /* デフォルトを等幅に */
            margin: 20px;
            background-color: #f4f4f4;
            color: #333;
        }

        h1, h2 {
            color: #333;
        }

        #keyboard-display, #sound-assignment {
            margin-bottom: 20px;
            padding: 10px;
            border: 1px solid #ccc;
            background-color: #fff;
            border-radius: 5px;
        }

        .keyboard-row {
            display: flex;
            margin-bottom: 5px;
        }

        .key {
            width: 40px;
            height: 40px;
            border: 1px solid #999;
            margin-right: 5px;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 18px;
            background-color: #eee;
            cursor: pointer;
            user-select: none; /* 標準的なテキスト選択防止 */
            -webkit-user-select: none; /* Safari, Chrome */
            -moz-user-select: none; /* Firefox */
            -ms-user-select: none; /* IE, Edge */
            -webkit-touch-callout: none; /* iOS Safariでの長押しメニュー防止 */
            /* font-family は body から継承されるので不要 */
            flex-shrink: 0; /* 親要素が狭くてもキーが縮まないようにする */
            box-sizing: border-box; /* paddingとborderをwidth/heightに含める */
        }

        @media (max-width: 600px) {
            .key {
                width: 28px; /* スマホ用にキー幅を小さく */
                height: 28px;
                font-size: 12px; /* フォントサイズも小さく */
                margin-right: 3px;
            }
            /* スマホ時のインデント調整 (キー幅とマージンに合わせて) */
            /* 新しいキー幅28px, マージン3px. (28+3)/2 = 15.5px */
            /* .keyboard-row の padding-left を main.js で設定しているので、そちらも変更が必要 */
            /* style.js からは直接変更できない。main.js での条件分岐が必要。 */
        }


        .key:hover {
            background-color: #ddd;
        }

        .key.active { /* キーが押されたときのスタイル */
            background-color: #bbb;
        }

        .key.disabled { /* 無効なキーのスタイル */
            background-color: #f8f8f8;
            color: #bbb;
            cursor: not-allowed;
        }


        #sound-assignment .key-assignment-row {
            display: flex;
            margin-bottom: 10px;
            align-items: center;
        }

        #sound-assignment .key-label {
            width: 30px;
            font-weight: bold;
            margin-right: 10px;
            text-align: center;
        }

        #sound-assignment .assignment-inputs {
            display: flex;
            flex-direction: column;
        }

        #sound-assignment .assignment-inputs div {
            display: flex;
            align-items: center;
            margin-bottom: 2px; /* 上下のinput間のマージン */
        }
        
        #sound-assignment .assignment-inputs hr {
            width: 100%;
            margin: 2px 0; /* 横線の上下マージン */
            border: none;
            border-top: 1px solid #ccc;
        }

        #sound-assignment input[type="text"] {
            width: 30px; /* 入力欄の幅を小さく */
            margin-right: 2px; /* 入力欄間のマージン */
            text-align: center;
            border: 1px solid #ccc;
            padding: 3px;
            font-family: monospace; /* 個別のinputがあった場合のため */
        }

        #assignment-textarea {
            width: 90%; /* PCでは少し余裕を持たせる */
            max-width: 600px; /* あまり広がりすぎないように */
            min-height: 150px; /* 最低限の高さを確保 */
            font-family: monospace; /* テキストエリアも等幅に */
            font-size: 1em;
            padding: 5px;
            border: 1px solid #ccc;
            box-sizing: border-box; /* paddingとborderをwidthに含める */
        }
        
        #sound-assignment .fraction-separator {
            margin: 0 5px;
        }

        #settings {
            margin-bottom: 20px;
            padding: 10px;
            border: 1px solid #ccc;
            background-color: #fff;
            border-radius: 5px;
        }

        #settings div {
            margin-bottom: 10px;
        }

        #settings label {
            margin-right: 10px;
        }

        #settings input[type="text"], #settings select {
            padding: 5px;
            border: 1px solid #ccc;
            border-radius: 3px;
        }

        footer {
            margin-top: 30px;
            text-align: center;
            font-size: 0.9em;
            color: #666;
        }

        footer a {
            color: #007bff;
            text-decoration: none;
        }

        footer a:hover {
            text-decoration: underline;
        }
    `;
    document.head.appendChild(style);
});
