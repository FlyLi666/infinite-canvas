import { create } from "zustand";

// 研路AI异步生图同一 Key 只有一个进行中任务（客户端也做了串行），
// 所以用一份全局状态文本即可让画布节点等生成中 UI 展示排队/重试进度。
type ImageTaskStore = {
    statusText: string;
    setStatusText: (statusText: string) => void;
    clearStatusText: () => void;
};

export const useImageTaskStore = create<ImageTaskStore>()((set) => ({
    statusText: "",
    setStatusText: (statusText) => set({ statusText }),
    clearStatusText: () => set({ statusText: "" }),
}));
