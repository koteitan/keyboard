// keyboard/expression_parser.js

const ExpressionParser = {
    // evaluateIdentifierCb(tokenName, currentAssignments, visitedKeysInCurrentEvalChain)
    parseAndEvaluate: function(expressionString, assignments = {}, baseFrequency = 0, visitedKeys = new Set(), evaluateIdentifierCb = null) {
        try {
            const tokens = this.tokenize(expressionString);
            const rpnTokens = this.toRPN(tokens);
            return this.evaluateRPN(rpnTokens, assignments, visitedKeys, evaluateIdentifierCb);
        } catch (error) {
            // console.error("ExpressionParser Error:", expressionString, error.message); // より詳細なエラー出力は呼び出し元で
            throw error; // エラーを再スローして呼び出し元でキャッチできるようにする
        }
    },

    tokenize: function(expression) {
        // 簡易的なトークナイザ。整数、演算子、括弧、キー名（英字）を認識
        const regex = /\s*([a-zA-Z_][a-zA-Z0-9_]*|[0-9]+(?:\.[0-9]+)?|\S)\s*/g;
        let tokens = [];
        let match;
        while ((match = regex.exec(expression)) !== null) {
            tokens.push(match[1]);
        }
        return tokens;
    },

    getPrecedence: function(op) {
        if (op === '^') return 3;
        if (op === '*' || op === '/') return 2;
        if (op === '+' || op === '-') return 1; // 加算・減算は今回未指定だが念のため
        return 0;
    },

    isOperator: function(token) {
        return ['+', '-', '*', '/', '^'].includes(token);
    },

    isAssociative: function(op, type) { // type: 'L' or 'R'
        if (op === '^') return type === 'R'; // 冪乗は右結合
        return type === 'L'; // その他は左結合
    },
    
    isNumber: function(token) {
        return !isNaN(parseFloat(token)) && isFinite(token);
    },

    isIdentifier: function(token) { // キー名
        return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token) && !this.isOperator(token) && token !== '(' && token !== ')';
    },

    toRPN: function(tokens) {
        let outputQueue = [];
        let operatorStack = [];

        tokens.forEach(token => {
            if (this.isNumber(token) || this.isIdentifier(token)) {
                outputQueue.push(token);
            } else if (this.isOperator(token)) {
                while (operatorStack.length > 0) {
                    const topOp = operatorStack[operatorStack.length - 1];
                    if (topOp === '(') break;
                    if (this.getPrecedence(topOp) > this.getPrecedence(token) ||
                        (this.getPrecedence(topOp) === this.getPrecedence(token) && this.isAssociative(token, 'L'))) {
                        outputQueue.push(operatorStack.pop());
                    } else {
                        break;
                    }
                }
                operatorStack.push(token);
            } else if (token === '(') {
                operatorStack.push(token);
            } else if (token === ')') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    outputQueue.push(operatorStack.pop());
                }
                if (operatorStack.length === 0 || operatorStack[operatorStack.length - 1] !== '(') {
                    throw new Error("Mismatched parentheses");
                }
                operatorStack.pop(); // '(' をポップ
            } else {
                throw new Error(`Unknown token: ${token}`);
            }
        });

        while (operatorStack.length > 0) {
            const op = operatorStack.pop();
            if (op === '(') {
                throw new Error("Mismatched parentheses");
            }
            outputQueue.push(op);
        }
        return outputQueue;
    },

    evaluateRPN: function(rpnTokens, assignmentsContext, visitedKeysInCurrentEvalChain, evaluateIdentifierCb) {
        let stack = [];

        rpnTokens.forEach(token => {
            if (this.isNumber(token)) {
                stack.push(parseFloat(token));
            } else if (this.isIdentifier(token)) {
                if (!evaluateIdentifierCb) {
                    throw new Error("evaluateIdentifierCb is not provided to ExpressionParser");
                }
                // 識別子の評価はコールバックに委譲する
                // コールバックは (identifierName, currentAssignmentsContextForParser, visitedKeysForRecursion) を期待
                const value = evaluateIdentifierCb(token, assignmentsContext, visitedKeysInCurrentEvalChain);
                if (value === null || value === undefined || isNaN(value)) { // isNaNもチェック
                    throw new Error(`Evaluation of identifier '${token}' failed or returned invalid value.`);
                }
                stack.push(value);
            } else if (this.isOperator(token)) {
                if (stack.length < 2) throw new Error(`Invalid RPN expression: not enough operands for operator '${token}' (stack: ${stack.join(',')})`);
                const b = stack.pop();
                const a = stack.pop();
                switch (token) {
                    case '+': stack.push(a + b); break;
                    case '-': stack.push(a - b); break;
                    case '*': stack.push(a * b); break;
                    case '/': 
                        if (b === 0) throw new Error("Division by zero");
                        stack.push(a / b); 
                        break;
                    case '^': stack.push(Math.pow(a, b)); break;
                    default: throw new Error(`Unknown operator: ${token}`);
                }
            } else {
                throw new Error(`Invalid token in RPN queue: ${token}`);
            }
        });

        if (stack.length !== 1) {
            // 空の式や、演算子が不足している場合など
            if (rpnTokens.length === 0 && expressionString.trim() === '') return null; // 空の式はnull
            throw new Error("Invalid RPN expression: stack should have 1 item at the end.");
        }
        
        // 最終結果は、もし式が単なる数値やキー参照で、演算を含まない場合、
        // それ自体が周波数となる。もし演算を含む場合、その結果が周波数。
        // ユーザーが "a=b" と書いた場合、bの周波数がaの周波数になる。
        // ユーザーが "a=440" と書いた場合、aは440Hz。
        // ユーザーが "a=base*2" と書いた場合、aは基準周波数の2倍。
        // ここでの `baseFrequency` の扱い:
        // 式の中に "base" という特別なキーを含めることで対応できる。
        // 例えば、`assignments['base'] = baseFrequency` のように渡す。
        // そうすれば、`evaluateRPN` 内の `isIdentifier` で "base" も処理される。
        return stack[0];
    }
};

// Node.js環境でのエクスポート (ブラウザで使う場合は不要)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExpressionParser;
}
