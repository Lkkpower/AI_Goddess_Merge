import { _decorator, Component, EventTouch, Label, Node, Vec3 } from "cc";
import { getItemConfigById } from "../data/ItemConfig";
import { eventManager, GameEvents } from "../core/EventManager";
const { ccclass, property } = _decorator;

@ccclass("MergeItem")
export class MergeItem extends Component {
    @property
    itemId = 0;

    @property
    row = 0;

    @property
    col = 0;

    @property(Label)
    nameLabel: Label | null = null;

    @property(Label)
    levelLabel: Label | null = null;

    private startPosition = new Vec3();
    private dragging = false;
    private touchTargets: Node[] = [];

    onLoad(): void {
        this.bindTouchTargets();
    }

    onDestroy(): void {
        this.unbindTouchTargets();
    }

    setData(itemId: number, row: number, col: number): void {
        this.itemId = itemId;
        this.row = row;
        this.col = col;
        this.refreshView();
        this.bindTouchTargets();
    }

    refreshView(): void {
        const config = getItemConfigById(this.itemId);
        if (this.nameLabel) {
            this.nameLabel.string = config?.name ?? "未知服装";
        }
        if (this.levelLabel) {
            this.levelLabel.string = config ? `Lv.${config.level}` : "Lv.?";
        }
    }

    setGridPosition(row: number, col: number): void {
        this.row = row;
        this.col = col;
    }

    getItemId(): number {
        return this.itemId;
    }

    getGridPosition(): { row: number; col: number } {
        return { row: this.row, col: this.col };
    }

    private bindTouchTargets(): void {
        this.unbindTouchTargets();
        const targets: Node[] = [];
        this.collectTouchTargets(this.node, targets);
        for (const target of targets) {
            target.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            target.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            target.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            target.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        }
        this.touchTargets = targets;
    }

    private unbindTouchTargets(): void {
        for (const target of this.touchTargets) {
            target.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
            target.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            target.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            target.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        }
        this.touchTargets = [];
    }

    private collectTouchTargets(node: Node, targets: Node[]): void {
        targets.push(node);
        for (const child of node.children) {
            this.collectTouchTargets(child, targets);
        }
    }

    private onTouchStart(event: EventTouch): void {
        this.stopTouchPropagation(event);
        this.dragging = true;
        this.startPosition.set(this.node.position);
        this.node.setSiblingIndex(999);
    }

    private onTouchMove(event: EventTouch): void {
        this.stopTouchPropagation(event);
        if (!this.dragging) {
            return;
        }
        const delta = event.getUIDelta();
        this.node.setPosition(this.node.position.x + delta.x, this.node.position.y + delta.y, this.node.position.z);
    }

    private onTouchEnd(event: EventTouch): void {
        this.stopTouchPropagation(event);
        if (!this.dragging) {
            return;
        }
        this.dragging = false;
        const worldPosition = this.node.worldPosition.clone();
        eventManager.emit(GameEvents.ITEM_DRAG_END, {
            itemNode: this.node,
            fromRow: this.row,
            fromCol: this.col,
            worldPosition,
        });
    }

    private onTouchCancel(event: EventTouch): void {
        this.stopTouchPropagation(event);
        this.dragging = false;
        this.node.setPosition(this.startPosition);
    }

    private stopTouchPropagation(event: EventTouch): void {
        (event as unknown as { propagationStopped: boolean }).propagationStopped = true;
    }
}
