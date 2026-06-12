class AudioManager {
    playClick(): void {
        console.log("[AudioManager] playClick");
        // TODO: 后续接入 Cocos AudioClip 播放点击音效。
    }

    playMerge(): void {
        console.log("[AudioManager] playMerge");
        // TODO: 后续接入合成成功音效。
    }

    playUnlock(): void {
        console.log("[AudioManager] playUnlock");
        // TODO: 后续接入皮肤解锁音效。
    }

    playFail(): void {
        console.log("[AudioManager] playFail");
        // TODO: 后续接入合成失败音效。
    }
}

export const audioManager = new AudioManager();
