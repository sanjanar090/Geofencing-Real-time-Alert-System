
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = ({ children, className = "", ...props }) => (
  <SelectPrimitive.Trigger
    className={`geo-select-trigger ${className}`}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon>
      <ChevronDown size={17} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
);

export const SelectContent = ({ children, className = "", ...props }) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      className={`geo-select-content ${className}`}
      position="popper"
      sideOffset={5}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="geo-select-scroll">
        <ChevronUp size={16} />
      </SelectPrimitive.ScrollUpButton>

      <SelectPrimitive.Viewport className="geo-select-viewport">
        {children}
      </SelectPrimitive.Viewport>

      <SelectPrimitive.ScrollDownButton className="geo-select-scroll">
        <ChevronDown size={16} />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
);

export const SelectLabel = ({ children, ...props }) => (
  <SelectPrimitive.Label className="geo-select-label" {...props}>
    {children}
  </SelectPrimitive.Label>
);

export const SelectItem = ({ children, className = "", ...props }) => (
  <SelectPrimitive.Item
    className={`geo-select-item ${className}`}
    {...props}
  >
    <span className="geo-select-item-indicator">
      <SelectPrimitive.ItemIndicator>
        <Check size={15} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);

export const SelectSeparator = (props) => (
  <SelectPrimitive.Separator className="geo-select-separator" {...props} />
);
