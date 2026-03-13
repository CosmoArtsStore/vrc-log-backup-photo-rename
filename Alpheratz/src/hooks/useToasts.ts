import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
    id: number;
    msg: string;
    type: ToastType;
}

export const useToasts = () => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((msg: string, type: ToastType = "info", duration = 3000) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, msg, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    return { toasts, addToast };
};
