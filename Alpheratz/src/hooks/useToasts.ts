import { useState, useCallback } from "react";

export const useToasts = () => {
    const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);

    const addToast = useCallback((msg: string, duration = 3000) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, msg }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    return { toasts, addToast };
};
