import { _decorator, Component } from "cc";
const { ccclass } = _decorator;

@ccclass("ShopView")
export class ShopView extends Component {
    open(): void {
        console.log("[ShopView] open");
        // TODO: 后续可做金币购买服装、广告领取高级服装。
    }
}
