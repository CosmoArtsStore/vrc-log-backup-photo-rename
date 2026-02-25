import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';

export interface AppSelectOption {
  value: string;
  label: string;
}

interface AppSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  /** フォームラベルと紐付ける id */
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 共通プルダウン。Radix Select ベースでデザイン・a11y を統一。
 */
export const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder = '選択してください',
  id,
  disabled = false,
  className = '',
}) => {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        className={`app-select__trigger ${className}`}
        aria-label={placeholder}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <span className="app-select__icon" aria-hidden>
            <ChevronDown size={16} />
          </span>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={typeof document !== 'undefined' ? document.querySelector('.app-container') as HTMLElement : undefined}>
        <SelectPrimitive.Content className="app-select__content" position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport className="app-select__viewport">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="app-select__item"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};
