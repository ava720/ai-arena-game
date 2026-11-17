# 通用核心模块

两个模块均为项目原创实现，无 DOM、Canvas、Socket.IO 或外部包依赖。
Node 使用 `require`，浏览器使用普通 `<script>`。渲染、输入和网络在模块外。
每次 `step` 只推进 1/60 秒，调用方不得按渲染刷新率直接调用。

## FighterEngine

`fighter-engine.js` 导出 `create(options)`、`step(state, inputs, predictionSlot)`、
`frameData`、`transitions`、`hurtbox` 和 `overlaps`。
浏览器全局为 `FighterEngine`，兼容全局为 `AIFight`。

轻拳模板所有角色统一：发生 4、判定 3、恢复 10、受击硬直 12 帧。
从零计数：actionFrame 0..3 不判定，4..6 判定，7..16 恢复。
连击顿帧不消耗上述帧数。一次攻击最多命中同一目标一次。

`state` 是 combat FSM：`idle -> attack -> recovery -> idle`。
受击可从任意战斗状态进入 `hitstun`；退出硬直经 `idle`。
恢复中只有已命中的招式且符合取消表时才能直接回到 `attack`。
走、跑、跳、防御、倒地和起身由独立 `locomotion` 表达。
所有转换均通过 `transition` 校验；不能用布尔攻击开关跳过恢复帧。

AABB 分别表示受击框和攻击框，攻击框只在 active 区间提交。
同一物理步先捕获双方接触，再统一结算，允许同时命中。
伤害、能量、命中及胜负由服务器结算；预测副本禁止这些结算。

## PartyController

`party-controller.js` 导出 `create`、`step`、`rules`、`collidePlayers`，
以及原赛道的检查点、机关与地面查询。浏览器全局为 `PartyController`，
兼容全局为 `AIRace`。x/z 是水平面，y 是离地高度。

控制加速度上限 1000 单位/s²，步行目标速度 165 单位/s；
无输入且触地时 `v *= exp(-4.8 * dt)`，随后用更新后的速度积分位置。
重力 1040 单位/s²、跳跃初速度 390 单位/s；所有时间为秒。
这些数值是项目的经验起点，不是行业统一或商业作品参数。

碰撞器为半径 18、高度 36 的竖直圆柱；水平采用圆形接触法线，
竖向不重叠时不碰撞。等质量为 1、恢复系数为 0.65。
先平均分离穿透，再计算 `j = -(1+e) * relativeNormalVelocity / 2`，
仅在两者靠近时施加相反冲量。零距离使用确定性法线，避免 NaN。
离散碰撞在当前速度上限下每步位移小于直径；调大速度或加入薄墙时需增加扫掠检测。

## 接入和验证

服务器已直接引用新模块；线上和本地入口在兼容入口前加载新模块。
既有状态包、输入确认、60Hz 时钟和客户端预测继续复用。
`fight.js` / `race.js` 以及旧引擎文件名仅保留为 CommonJS 兼容入口。
浏览器仍须先加载新模块，不能单独加载兼容入口。

```js
const Fighter = require('./fighter-engine.js');
const Party = require('./party-controller.js');
const fight = Fighter.create({characters: ['gpt', 'deepseek']});
const race = Party.create();
// 由现有 fixed-step.cjs 驱动，每个物理步调用一次：
Fighter.step(fight, [{right: true, light: true}, {}]);
Party.step(race, [{up: true, jump: true}, {left: true}]);
// create 默认进入准备倒计时，只有进入 playing 后才接受动作。
```

`tests/generic-engines.test.cjs` 覆盖 FSM 转换、逐帧攻击窗口、硬直，
以及碰撞动量、能量损失、分离、阻尼和跳跃；原有网络与预测测试继续保留。
这是经过自动化验证的基础实现，尚不能视作通过机型矩阵和压力测试的赛事级成品。
