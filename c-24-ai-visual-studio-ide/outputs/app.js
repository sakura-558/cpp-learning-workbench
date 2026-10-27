const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORE = { theme: 'ziting-theme', tags: 'ziting-tags', saved: 'ziting-saved-exercises', name: 'ziting-user-name' };
const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing may disable storage */ } };
let activeMode = 'understand';
let activeExercise = 'postfix';
let explanationLevel = 'beginner';
let pendingPrompt = '';
let toastTimer;
let currentImageUrl = '';
let currentProblemQuestion = '';
const toast = (message) => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2300); };

function navigate(view, options = {}) {
  const target = $(`#view-${view}`);
  if (!target) return;
  $$('.view').forEach(item => item.classList.toggle('active', item === target));
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  if (options.mode) setMode(options.mode, false);
  if (options.prompt) pendingPrompt = options.prompt;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'solve' && pendingPrompt) {
    const prompt = pendingPrompt;
    pendingPrompt = '';
    setTimeout(() => { $('#chatInput').value = prompt; $('#chatInput').focus(); }, 180);
  }
}
$$('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
$$('[data-go]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.prompt) return;
  navigate(button.dataset.go, { mode: button.dataset.mode });
}));

function setMode(mode, announce = true) {
  activeMode = mode;
  $$('.mode-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.solveMode === mode));
  const imageMode = mode === 'problem';
  $('#imageIntake').classList.toggle('hidden', !imageMode);
  if (imageMode && !currentImageUrl) $('#imagePlaceholder').classList.remove('hidden');
  $('#view-solve .code-editor').classList.toggle('hidden', imageMode);
  $('#view-solve .code-toolbar').classList.toggle('hidden', imageMode);
  $('#view-solve .code-tip').classList.toggle('hidden', imageMode);
  $('#workbenchTitle').textContent = imageMode ? '上传题目图片，补充题意后开始' : '先放入想研究的代码';
  $('#uploadButton').textContent = imageMode ? '选择题目图片' : '上传题目图片';
  if (imageMode) {
    if (announce) addMessage('ai', '进入题目图片模式了。先上传题目截图，再补充图片中的文字或输入要求；我会根据你选择的方式给出提示、思路或复杂度分析。', ['我已经补充题目文字']);
  } else if (mode === 'error') {
    $('#codeInput').value = '#include <iostream>\nusing namespace std;\n\nint main() {\n    int score = 90\n    cout << score << endl;\n    return 0;\n}';
    $('#lineNumbers').textContent = '1\n2\n3\n4\n5\n6\n7\n8';
    $('#codeInput').setAttribute('aria-label', '包含示例编译错误的 C++ 代码');
    if (announce) addMessage('ai', '我们换成报错模式。这里的 `expected \';\' before \'cout\'` 往往意味着编译器在 cout 前面还等着上一句话结束。你能找到上一句从哪里开始吗？', ['我看到了 int score', '请解释这条英文报错']);
  } else {
    $('#codeInput').value = '#include <iostream>\nusing namespace std;\n\nint main() {\n    int count = 3;\n    cout << count++ << " " << count;\n    return 0;\n}';
    $('#lineNumbers').textContent = '1\n2\n3\n4\n5\n6\n7';
    $('#codeInput').setAttribute('aria-label', 'C++ 代码编辑区');
    if (announce) addMessage('ai', '回到代码理解。我们不直接背输出，先把第 6 行拆成两次使用 count。你猜第一次输出时，它是 3 还是 4？', ['我猜是 3', '我猜是 4']);
  }
  $('#runOutput').classList.add('hidden');
  $('#analysisDrawer').classList.add('hidden');
  if (announce) toast(mode === 'error' ? '已切换到报错解析练习' : imageMode ? '已切换到题目图片解题' : '已切换到代码理解练习');
}
$$('.mode-tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.solveMode)));

function addMessage(who, message, suggestions = []) {
  const row = document.createElement('div');
  row.className = `chat-row ${who === 'user' ? 'user-row' : 'ai-row'}`;
  const avatar = document.createElement('div'); avatar.className = 'chat-avatar'; avatar.textContent = who === 'user' ? '林' : '✦';
  const bubble = document.createElement('div'); bubble.className = 'chat-bubble';
  message.split('\n').filter(Boolean).forEach(text => { const p = document.createElement('p'); p.textContent = text; bubble.append(p); });
  if (suggestions.length && who === 'ai') {
    const actions = document.createElement('div'); actions.className = 'chat-actions';
    suggestions.forEach(suggestion => { const button = document.createElement('button'); button.className = 'suggestion'; button.dataset.prompt = suggestion; button.textContent = suggestion; actions.append(button); });
    bubble.append(actions);
  }
  const time = document.createElement('time'); time.textContent = '刚刚'; bubble.append(time);
  row.append(avatar, bubble); $('#chatBody').append(row); $('#chatBody').scrollTop = $('#chatBody').scrollHeight;
}

function assistantReply(input) {
  const text = input.toLowerCase();
  const code = $('#codeInput').value;
  if (activeMode === 'problem' && /补充.*题目|题目文字|上传.*题目/.test(text)) return ['好，你可以把题目文字粘贴到左侧输入框，然后选择提示、解题思路或复杂度分析。图片本身在这个 Demo 里不会自动识别。', ['我已补充，开始分析']];
  if (activeMode === 'problem' && /复述|自己的话|输入.*输出/.test(text)) return ['很好，先用自己的话说清楚输入和目标。接下来再确认解法要维护什么状态、每一步如何更新。你先把题目中的输入格式告诉我？', ['我想继续看算法步骤', '这题的边界情况是什么？']];
  if (activeMode === 'problem' && /完整思路|算法步骤|伪代码/.test(text)) return [makeProblemGuide(currentProblemQuestion || text, 'explain'), ['我想分析复杂度', '我试着复述一下']];
  if (activeMode === 'problem' && /提示|卡住|不知道/.test(text)) return [makeProblemGuide(currentProblemQuestion || text, 'guide'), ['我想看完整思路', '我想分析复杂度']];
  if (activeMode === 'problem' && /复杂度/.test(text)) return [makeProblemGuide(currentProblemQuestion || text, 'plan'), ['我试着写伪代码', '再解释一下边界条件']];
  if (activeMode === 'error' && /score|int |变量|赋值/.test(text)) return ['对，先看 `int score = 90` 这一句。它做完声明并赋值后，需要一个结束符号；下一行的 cout 是新的一句。你觉得 C++ 用什么符号表示一句语句结束？', ['分号 ;', '逗号 ,']];
  if (activeMode === 'error' && /上一句|少了分号|分号\s*;/.test(text)) return ['没错，上一句应该用分号 `;` 结束。你可以自己补上，再看编译器会不会报告新的问题。', ['我补好了', '为什么它指向 cout？']];
  if (/当前值.*3|count.*初始值.*3/.test(text)) return ['对，第一次读取拿到 3。取走这个旧值后，count++ 会让变量加一；所以第二次读取时，你猜它是多少？', ['第二次读取是 4', '为什么要先取旧值？']];
  if (/已经变成 4|加一之后|第二次读取在加一之后/.test(text)) return ['正是这样：第一次读取拿到旧值 3，递增后变量变成 4，后面的读取才看到 4。你已经把顺序说出来了。', ['那 ++count 有什么不同？', '我想再练一道']];
  if (/先使用旧值|输出后才加一|第一次读取后才递增/.test(text)) return ['对，关键就是先使用当前值，再完成递增。你能把这两个时刻分别对应到第 6 行里的哪两个部分吗？', ['count++ 先提供旧值', '我想看前置递增']];
  if (/不知道|从哪|不懂|看不懂/.test(text)) return ['没关系，我们把范围缩小一点。先看赋值：`count` 一开始是多少？你可以只回答一个数字。', ['count 一开始是 3', '我不确定赋值是什么意思']];
  if (/4\s*4|猜.*4|输出.*4/.test(text)) return ['你预测两个位置都会读到 4。关键是看 `count++` 的结果什么时候被取走。\n它叫“后置”递增：名字里的“后”是在提醒我们哪件事发生得晚一些？', ['输出后才加一？', '给我一个更小的提示']];
  if (/3\s*4|猜.*3|输出.*3/.test(text)) return ['这个预测抓住了第一步：`count++` 先把旧值交给输出。接下来还有一个 `count`，你觉得它此时已经变了，还是还没变？', ['它已经变成 4', '它还没变']];
  if (/小提示|更小|提示/.test(text)) return ['把一行拆成两个时刻：① 先用 count；② 再让 count 加一。\n现在代码里第二次读取 count 发生在这两个时刻之前，还是之后？', ['第二次读取在加一之后', '我想看步骤图']];
  if (/分号|expected|报错|英文/.test(text) || activeMode === 'error') return ['`expected \'；\' before \'cout\'` 可以理解为：“我读到 cout 了，但上一句似乎还没结束。”\n错误箭头常指向编译器发现问题的位置，不一定是你最先要修改的那一行。看看 cout 前一行结尾，你发现了什么？', ['上一行少了分号', '为什么指向下一行？']];
  if (/区别|前置|\+\+count/.test(text)) return ['你已经碰到关键区别了。`count++` 把旧值作为表达式结果，再递增；`++count` 会先递增，再把新值作为表达式结果。\n如果 count 是 3，你觉得单独输出 `++count` 会先看到几？', ['会看到 4', '可以再举个例子吗']];
  if (/步骤|过程|慢|解释|执行/.test(text)) return ['好，我们慢一点，一次只看一个动作。\n第 5 行执行后，count 是 3。到了第 6 行，`count++` 会先提供当前值，再完成递增。你觉得“当前值”是多少？', ['当前值是 3', '我想用自己的话说一遍']];
  if (/自己的话|复盘|讲给我/.test(text)) return ['试着用一句话讲讲你的理解，我会帮你检查有没有漏掉顺序。\n可以从“后置递增会先……”开始。', ['后置递增先使用旧值', '我还没完全理解']];
  if (/score|int |变量|赋值/.test(text) && activeMode === 'error') return ['对，先看 `int score = 90` 这一句。它做完“声明并赋值”后，需要一个结束符号；下一行的 `cout` 是新的一句。\n你觉得 C++ 用什么符号表示一句语句结束？', ['分号 ;', '逗号 ,']];
  if (/ ;|逗号|括号/.test(text)) return ['是分号 `;`。你可以试着自己补上它，然后再运行一次。修好后告诉我，错误信息有没有变化？', ['我补好了', '还有别的错误吗？']];
  const count = (code.match(/\bcount\b/g) || []).length;
  if (/代码|分析/.test(text) || count > 1) return ['我可以陪你从头走一遍。先不用解释整段：找一个变量，告诉我它的初始值是多少？', ['count 的初始值是 3', '我先问这一行']];
  return ['我听到了。我们把问题拆小一点：你现在更想弄懂“这行代码做什么”，还是“为什么会得到这个结果”？', ['这行代码做什么', '为什么得到这个结果']];
}
function sendPrompt(value) {
  const text = value.trim(); if (!text) return;
  addMessage('user', text);
  $('#chatInput').value = '';
  setTimeout(() => {
    const [answer, suggestions] = assistantReply(text);
    const levelNote = explanationLevel === 'advanced' ? '\n进阶补充：可以把“旧值作为表达式结果”和“对象状态发生改变”看作两个不同的观察时刻。' : '';
    addMessage('ai', answer + levelNote, suggestions);
  }, 350);
}
$('#chatForm').addEventListener('submit', event => { event.preventDefault(); sendPrompt($('#chatInput').value); });
document.addEventListener('click', event => {
  const promptButton = event.target.closest('[data-prompt]');
  if (promptButton) {
    if (promptButton.dataset.go) navigate(promptButton.dataset.go, { mode: promptButton.dataset.mode });
    else if (!$('#view-solve').classList.contains('active')) navigate('solve');
    sendPrompt(promptButton.dataset.prompt);
    return;
  }
});
$('#newChat').addEventListener('click', () => {
  $('#chatBody').innerHTML = '';
  addMessage('ai', '新的学习对话开始了。你可以粘贴一小段代码，或告诉我你想弄懂的概念。我们会先从你的想法开始。', ['预测这段代码的结果', '我遇到编译报错']);
  $('#analysisDrawer').classList.add('hidden'); toast('已开始新的学习对话');
});

function analyzeCode() {
  const code = $('#codeInput').value;
  if (!code.trim()) { toast('先贴一段代码，我们再一起看'); $('#codeInput').focus(); return; }
  if (activeMode === 'error') {
    const lines = code.split('\n');
    const coutIndex = lines.findIndex(line => /\bcout\b/.test(line));
    const prior = coutIndex > 0 ? lines[coutIndex - 1].trim() : '';
    const likelySemicolon = prior && /(?:\d|\w|\)|")$/.test(prior) && !/[;{}:]$/.test(prior);
    if (likelySemicolon) {
      const lineNumber = coutIndex + 1;
      $('.drawer-title b').textContent = '我发现一个可能的语法问题';
      $('.drawer-title small').textContent = `第 ${lineNumber} 行提示错误，检查它前一行`;
      $('.confidence').textContent = '常见原因';
      $$('.step-item small')[0].textContent = `上一行是：${prior}`;
      $$('.step-item small')[1].textContent = 'C++ 语句通常需要用分号 ; 结束';
      addMessage('ai', `我看到第 ${lineNumber} 行的 cout 前面，上一句可能没有结束。先检查第 ${lineNumber} 行之前的那一行。\n这只是常见原因提示；如果你把编译器的完整报错贴上来，我们还能继续核对。`, ['上一句少了分号', '为什么箭头指向 cout？']);
      recordTag('语法与标点', '语句末尾分号');
    } else {
      addMessage('ai', '我没有从这段示例里看出典型的“cout 前缺少分号”情况。把完整编译器报错贴到对话里吧，行号和上下文会帮助我们缩小范围。', ['怎么复制编译器报错？', '我想先理解这段代码']);
    }
    $('#analysisDrawer').classList.remove('hidden');
    toast('已完成演示检查，请结合编译器原始信息确认');
    return;
  }
  const postfixOutput = code.match(/cout\s*<<\s*(\w+)\s*\+\+\s*<<\s*["']\s+["']\s*<<\s*(\w+)/);
  const hasPostfix = Boolean(postfixOutput && postfixOutput[1] === postfixOutput[2]);
  const startsAt = code.match(/\b(\w+)\s*=\s*(-?\d+(?:\.\d+)?)/);
  const variable = hasPostfix ? postfixOutput[1] : null;
  if (hasPostfix) {
    const initial = Number(code.match(new RegExp(`\\b${variable}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`))?.[1] ?? 0);
    $('#outputValue').textContent = `${initial} ${initial + 1}`;
    $('#runOutput').classList.remove('hidden');
    $$('.step-item small')[0].textContent = `第 1 次读取 ${variable}：后置递增先提供旧值 ${initial}`;
    $$('.step-item small')[1].textContent = `递增后 ${variable} 变为 ${initial + 1}，下一次读取拿到新值`;
    $('.drawer-title b').textContent = '这段代码可以拆成两个时刻';
    $('.drawer-title small').textContent = '模拟预测，不会替你改写代码';
    $('.confidence').textContent = '执行顺序';
    $('#analysisDrawer').classList.remove('hidden');
    addMessage('ai', `我找到一处值得慢下来的表达式：${variable}++。\n按这段示例的执行顺序，第一次读取会拿到 ${initial}，随后变量变成 ${initial + 1}。右侧输出是对这个简单模式的演示模拟；你觉得第二次读取为什么会看到新值？`, ['因为第一次读取后才递增', '那 ++count 呢？']);
    recordTag('执行顺序', '后置递增');
  } else if (startsAt) {
    addMessage('ai', `我看到变量 ${startsAt[1]} 的初始值是 ${startsAt[2]}。我们先追踪它：后面的哪一行第一次使用了这个变量？`, ['我找到它了', '帮我预测输出']);
  } else {
    addMessage('ai', '我先通读了这段代码，但这个演示目前只会模拟少数基础表达式，不会假装编译了任意 C++。你想让我带你逐行解释，还是贴出你自己的预测让我追问？', ['请逐行解释', '我先说说我的预测']);
  }
}
$('#analyzeButton').addEventListener('click', analyzeCode);
$('#simulateButton').addEventListener('click', () => {
  const code = $('#codeInput').value;
  const initial = code.match(/\b(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/);
  const output = code.match(/cout\s*<<\s*(\w+)\s*\+\+\s*<<\s*["']\s+["']\s*<<\s*(\w+)/);
  if (activeMode === 'error' && /\bcout\b/.test(code)) { toast('这个示例含有语法错误，请先看 AI 的定位提示'); return; }
  if (!initial || !output || initial[1] !== output[1] || initial[1] !== output[2]) { toast('当前演示只模拟“整数变量 + 后置递增 + 输出两次变量”这一类代码'); return; }
  const initialValue = Number(initial[2]); $('#outputValue').textContent = `${initialValue} ${initialValue + 1}`; $('#runOutput').classList.remove('hidden');
  toast('已生成基础模式的输出预测，可以继续追问原因');
});
$('#clearCode').addEventListener('click', () => { $('#codeInput').value = ''; $('#runOutput').classList.add('hidden'); toast('代码区已清空'); });
$('#uploadButton').addEventListener('click', () => { setMode('problem', false); $('#imageIntake').classList.remove('hidden'); if (!currentImageUrl) $('#imagePlaceholder').classList.remove('hidden'); $('#imageUpload').click(); });
$('#imageUpload').addEventListener('change', event => {
  const file = event.target.files[0]; if (!file) return;
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  currentImageUrl = URL.createObjectURL(file);
  $('#questionPreview').src = currentImageUrl;
  $('#imagePlaceholder').classList.add('hidden');
  $('#imageIntake').classList.remove('hidden');
  addMessage('ai', `已载入“${file.name}”。我能在这里展示题目并根据你补充的题意组织解题思路；当前纯前端 Demo 没有 OCR 或云端模型，所以不会假装已经读懂图片里的每个字。`, ['我已经补充题目文字']);
  toast('图片已载入，请补充题目文字');
});
$('#removeImage').addEventListener('click', () => { $('#questionPreview').removeAttribute('src'); $('#imagePlaceholder').classList.remove('hidden'); $('#imageIntake').classList.add('hidden'); $('#imageUpload').value = ''; if (currentImageUrl) URL.revokeObjectURL(currentImageUrl); currentImageUrl = ''; toast('已移除题目图片'); });

function makeProblemGuide(question, style) {
  const patterns = [
  { match: /1\s*(?:到|至|~|-|—)\s*n|前\s*n\s*项和|1\s*\+\s*2\s*\+\s*…|求.*(?:和|总和)/i, concept: '累加求和', steps: '设 sum = 0；从 1 循环到 n，每轮执行 sum += i；最后输出 sum。', complexity: '时间 O(n)，额外空间 O(1)。', check: 'n = 3 时，循环里 sum 会依次变成多少？', hint: '先找“重复做的动作”：每次把当前 i 加到一个累加器里。', boundary: '如果题目允许 n = 0，循环会执行几次？sum 的初值应是什么？' },
  { match: /最大值|最大数|max(?:imum)?/i, concept: '逐项比较并更新最大值', steps: '先把 max 设为第一个输入值；逐个读取剩余数字，如果当前数大于 max，就更新 max；最后输出 max。', complexity: '时间 O(n)，额外空间 O(1)。', check: '为什么不建议一开始就随便把 max 设成 0？', hint: '记住一个“目前最大值”，每读到一个新数就和它比较。', boundary: '输入里全是负数时，初始 max 应该取什么？' },
  { match: /质数|素数|prime/i, concept: '枚举可能的因数', steps: '小于 2 的数不是质数；从 2 开始检查到 i <= n / i。如果能整除 n 就不是质数；都不能整除才是质数。', complexity: '时间 O(√n)，额外空间 O(1)。', check: '为什么检查到平方根附近就足够？', hint: '质数只需要检查它有没有除了 1 和自己之外的因数。', boundary: '别忘了 0、1 和负数；循环条件也要包含平方根边界。' },
  { match: /阶乘|factorial|n\s*!/i, concept: '循环累乘', steps: '令 result = 1；从 1 循环到 n，每轮 result *= i；最后输出 result。n = 0 时按定义结果为 1。', complexity: '时间 O(n)，额外空间 O(1)。', check: '这里为什么要让累乘器从 1 开始，而不是从 0 开始？', hint: '把求和中的“累加”换成“累乘”，先确定乘积的初始值。', boundary: '确认 n 的范围，较大的阶乘可能超出 int 的表示范围。' }
  ];
  const match = patterns.find(pattern => pattern.match.test(question));
  if (!match) return `我先把题面整理成待解决的问题：${question}\n我还不能可靠识别这类题的算法，避免凭空猜答案。请补充输入范围、输入输出要求，或把关键条件贴清楚；我可以再帮你拆解。先问自己：题目给了什么，要求你算出什么？`;
  if (style === 'guide') return `我识别到这题可能考查「${match.concept}」。先给你一个起点：${match.hint}\n先不要写完整代码，想一想：${match.check}`;
  if (style === 'plan') return `这题可以用「${match.concept}」来做。\n算法步骤：${match.steps}\n复杂度：${match.complexity}\n边界检查：${match.boundary}\n你可以先用一个最小输入手动走一遍，确认循环次数。`;
  return `这题的核心是「${match.concept}」，先把题目转成步骤，不急着抄完整代码：\n${match.steps}\n检查一个容易忽略的情况：${match.boundary}\n想先从哪个步骤开始自己写？`;
}
$('#solveImageButton').addEventListener('click', () => {
  const question = $('#questionText').value.trim();
  const style = $('#answerStyle').value;
  if (!question) { $('#questionText').focus(); toast('先补充题目文字，才能根据题意组织解题'); return; }
  currentProblemQuestion = question;
  addMessage('user', `题目图片已上传。题目补充：${question}`);
  const guidance = makeProblemGuide(question, style);
  setTimeout(() => addMessage('ai', guidance, ['我想用自己的话复述', '再给我一个提示']));
  recordTag('题目分析', '图片题目解法');
  toast('已生成题目分析，可继续在右侧对话里追问');
});
$('#codeInput').addEventListener('input', () => { const lineCount = $('#codeInput').value.split('\n').length; $('#lineNumbers').textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n'); });

function recordTag(category, topic) {
  const records = readStore(STORE.tags, []).map(record => typeof record === 'string' ? { category: '语法与标点', topic: record, date: '', count: 1 } : record);
  if (!records.some(record => record.topic === topic)) records.push({ category, topic, date: new Date().toISOString().slice(0, 10), count: 1 });
  else records.find(record => record.topic === topic).count += 1;
  writeStore(STORE.tags, records);
  updateRecordSummary(records);
}

function updateRecordSummary(records = readStore(STORE.tags, [])) {
  const normalized = records.map(record => typeof record === 'string' ? { category: '语法与标点', topic: record, count: 1 } : record);
  $('#recordCount').textContent = Math.max(3, normalized.length + 2);
  const totals = { '语法与标点': 8, '变量与类型': 5, '执行顺序': 4, '循环与条件': 3 };
  const selectors = { '语法与标点': 0, '变量与类型': 1, '执行顺序': 2, '循环与条件': 3 };
  normalized.forEach(record => { if (Object.hasOwn(totals, record.category)) totals[record.category] += Math.max(1, Number(record.count) || 1); });
  const rows = $$('.topic-row');
  Object.entries(selectors).forEach(([category, index]) => {
    const row = rows[index]; if (!row) return;
    const total = totals[category]; row.querySelector(':scope > b').textContent = total;
    row.querySelector('.topic-bar i').style.width = `${Math.min(100, total * 9)}%`;
  });
}

const exercises = {
  postfix: { title:'下面的代码会输出什么？', category:'练习 02 · 运算符', code:'int count = 3;\ncout << count++ << " " << count;', prompt:'先不要运行。请把每一行执行后的 count 值写在脑中，再选择你认为会出现的结果。', answers:['3 4','4 4','4 3'], labels:['先输出旧值','先加一再输出','输出顺序相反'], correct:'3 4' },
  type: { title:'整数除法会保留小数吗？', category:'练习 03 · 变量', code:'int total = 7;\nint people = 2;\ncout << total / people;', prompt:'先想一想两个 int 相除时，结果会是什么类型。小数部分会发生什么？', answers:['3','3.5','4'], labels:['两个操作数都是 int','保留小数部分','向上取整'], correct:'3' },
  loop: { title:'循环结束时，i 的值是多少？', category:'练习 04 · 循环', code:'int i = 0;\nwhile (i < 3) {\n    i++;\n}\ncout << i;', prompt:'把每次检查条件和循环体分开追踪，看看 i 在什么时候增加。', answers:['3','2','4'], labels:['循环体执行三次','少执行了一次','多执行了一次'], correct:'3' }
};
$$('.practice-list-item').forEach(item => item.addEventListener('click', () => {
  activeExercise = item.dataset.exercise;
  $$('.practice-list-item').forEach(button => button.classList.toggle('active', button === item));
  const exercise = exercises[activeExercise];
  $('.exercise-top .eyebrow-chip').textContent = exercise.category;
  $('.exercise-panel h2').textContent = exercise.title;
  $('.exercise-desc').textContent = exercise.prompt;
  $('.exercise-code').textContent = exercise.code;
  $$('.answer-grid button').forEach((button, index) => {
    const value = exercise.answers[index];
    button.dataset.answer = value;
    button.querySelector('b').textContent = value;
    button.querySelector('small').textContent = exercise.labels[index];
  });
  $('#exerciseFeedback').innerHTML = '<span class="feedback-icon">?</span><p>选一个答案，我会根据你的选择追问，而不是马上公布结论。</p>';
  $$('.answer-grid button').forEach(button => button.classList.remove('selected'));
  toast('已打开这道练习');
}));
$$('.filter-button').forEach(button => button.addEventListener('click', () => {
  $$('.filter-button').forEach(item => item.classList.toggle('active', item === button));
  if (button.textContent === '变量') $('.practice-list-item[data-exercise="type"]').click();
  if (button.textContent === '运算符') $('.practice-list-item[data-exercise="postfix"]').click();
}));
const answerPrompts = {
  '3 4': ['很好，你的预测抓住了“先取旧值”。现在自己检查：第一次输出结束后，count 发生了什么变化？', '那后面的 count 会输出多少？'],
  '4 4': ['你认为递增会先发生，这个想法和前置递增很像。看一下 `++` 写在变量前还是后：位置会不会改变顺序？', '我想看看时间线'],
  '4 3': ['你注意到了两个读取顺序，但结果的前后可能倒过来了。`cout` 从左往右处理；它先遇到哪个 count？', '我再想一次']
};
$$('.answer-grid button').forEach(button => button.addEventListener('click', () => {
  $$('.answer-grid button').forEach(item => item.classList.toggle('selected', item === button));
  const exercise = exercises[activeExercise];
  const [feedback, question] = activeExercise === 'postfix'
    ? (answerPrompts[button.dataset.answer] || answerPrompts['3 4'])
    : button.dataset.answer === exercise.correct
      ? ['先给自己一点肯定：你可以用代码顺序来验证这个想法。逐行追踪后，看看关键值有没有变化。', '你能说出是哪一步决定了这个结果吗？']
      : ['先别急着改答案。看变量的类型和每一次循环条件，哪一步最可能改变结果？', '把变量变化逐行写下来试试'] ;
  $('#exerciseFeedback').innerHTML = `<span class="feedback-icon">↗</span><p>${feedback}<br><b class="followup-question">${question}</b></p>`;
  if (button.dataset.answer === exercise.correct) recordTag(activeExercise === 'type' ? '变量与类型' : activeExercise === 'loop' ? '循环与条件' : '执行顺序', activeExercise === 'type' ? '整数除法' : activeExercise === 'loop' ? '循环计数器' : '后置递增');
}));
$('#saveExercise').addEventListener('click', () => {
  const saved = readStore(STORE.saved, []);
  const title = exercises[activeExercise].title;
  if (!saved.includes(title)) saved.push(title);
  writeStore(STORE.saved, saved); $('#saveExercise').textContent = '✓ 已收藏'; toast('已保存到你的练习记录');
});

$('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark'); writeStore(STORE.theme, document.body.classList.contains('dark') ? 'dark' : 'light'); });
if (readStore(STORE.theme, 'light') === 'dark') document.body.classList.add('dark');
updateRecordSummary();
$('#levelToggle').addEventListener('click', event => {
  const button = event.currentTarget;
  explanationLevel = explanationLevel === 'advanced' ? 'beginner' : 'advanced';
  button.dataset.level = explanationLevel;
  button.textContent = explanationLevel === 'beginner' ? '入门讲解⌄' : '进阶讲解⌄';
  addMessage('ai', explanationLevel === 'beginner' ? '我会把术语收回来，用更慢的步骤解释。' : '我会增加一点术语和边界情况，帮助你把概念连接起来。');
  toast(explanationLevel === 'beginner' ? '已切换到入门讲解' : '已切换到进阶讲解');
});
function renderUserName(name = readStore(STORE.name, '学习者')) {
  const safeName = String(name || '学习者').trim().slice(0, 16) || '学习者';
  $('#overviewTitle').textContent = `下午好，${safeName}。`;
  $('#sideName').textContent = safeName;
  $('#profileInitial').textContent = safeName.slice(0, 1);
  $('#sideInitial').textContent = safeName.slice(0, 1);
  return safeName;
}
renderUserName();
$('#profileButton').addEventListener('click', () => { $('#nicknameInput').value = renderUserName(); $('#profileDialog').showModal(); });
$('#profileForm').addEventListener('submit', event => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  const name = renderUserName($('#nicknameInput').value);
  writeStore(STORE.name, name);
  $('#profileDialog').close();
  toast(`已改为称呼你为“${name}”`);
});
$('#sideSettings').addEventListener('click', () => { $('#nicknameInput').value = renderUserName(); $('#profileDialog').showModal(); });
$('#statsMore').addEventListener('click', () => toast('本周学习 5 天，累计练习 6 道'));
$('#exportRecord').addEventListener('click', () => {
  const records = readStore(STORE.tags, []);
  const content = ['紫藤 C++ 学习记录', `导出时间：${new Date().toLocaleDateString('zh-CN')}`, '', ...(records.length ? records.map(item => `${item.category} · ${item.topic}（练习 ${item.count} 次）`) : ['还没有本地保存的错题标签。'])].join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = '紫藤-C++学习记录.txt'; link.click(); URL.revokeObjectURL(url); toast('学习记录已导出');
});
