import { exeInput } from "../api/executeInput";

export async function handleInput(eID: string | number, msg: string):Promise<boolean> {
    let inputs = [];
    let delimiter = " ";
    let match;

    // 第一轮，尝试匹配题目直接给出的输入
    const regex = /：(-?\d+\.\d+|-?\d+|[a-zA-Z]+)/g;
    while ((match = regex.exec(msg)) !== null) {
        inputs.push(match[1]);
    }

    if (inputs.length === 0) { // 第二轮，尝试推导
        const bracketRegex = /(.)个(整数|字符|浮点数|正整数)/g;
        if ((match = bracketRegex.exec(msg)) !== null) {
            const count = match[1]!;
            const type = match[2]!;

            // 处理数字或汉字数字的计数
            let numericCount;
            if (/\d+/.test(count)) {
                numericCount = parseInt(count);
            } else {
                // 汉字数字转数字
                numericCount = chineseToNum[count] || 1;
            }

            switch (type) {
                case "整数":
                case "正整数":
                    inputs = Array(numericCount).fill(1);
                    break;
                case "字符":
                    inputs = Array(numericCount).fill("a");
                    break;
                case "浮点数":
                    inputs = Array(numericCount).fill(1.5);
                    break;
            }
        }
    }

    for (const [key, value] of Object.entries(map_delimiter)) {
        if (msg.includes(key)) {
            delimiter = value;
            break;
        }
    }

    const input = inputs.join(delimiter);
    console.log(input);
    const res = await exeInput(eID, input);

    const output = res.data.output;

    if (!res.data.passed) {
        throw output;
    }

    return true;
}

const map_delimiter = {
    空格: " ",
    逗号: ",",
    ",": ",",
    回车: "\n",
};
const chineseToNum: { [key: string]: number } = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
};
