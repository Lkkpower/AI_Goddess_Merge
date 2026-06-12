import { _decorator, Component } from "cc";
const { ccclass } = _decorator;

@ccclass("ResultView")
export class ResultView extends Component {
    open(): void {
        console.log("[ResultView] open");
        // TODO: 后续可做结算页、最高等级展示、分享按钮。
    }
}
