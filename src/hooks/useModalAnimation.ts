import { useCallback, useState } from 'react';

export const useModalAnimation = (onClose: () => void, duration: number = 180) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, duration);
  }, [onClose, duration]);

  return {
    isClosing,
    handleClose,
  };
};
