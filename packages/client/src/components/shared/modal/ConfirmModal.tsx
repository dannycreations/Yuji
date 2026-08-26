import { Effect } from 'effect';

import { ButtonInput } from '@yuji/client/components/shared/InputArea';
import { Modal, ModalFooter, ModalHeader } from '@yuji/client/components/shared/modal/Modal';
import { useStore, useStoreAction } from '@yuji/client/hooks/useStore';

import type { FC, ReactNode } from 'react';

const parseBoldText = (text: string): (string | ReactNode)[] =>
  text.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));

export const ConfirmModal: FC = () => {
  const confirm = useStore((s) => s.confirm);
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', id, variant = 'danger', isOpen } = confirm;

  const onCancel = useStoreAction((s) => s.update((prev) => ({ ...prev, confirm: { ...prev.confirm, isOpen: false } })));
  const onConfirm = useStoreAction((s) => (id ? s.executeConfirm(id) : Effect.void));

  const handleCancel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onCancel();
  };

  const handleConfirm = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} containerClassName="confirm-modal-container">
      <div className="confirm-modal-content">
        <ModalHeader title={title} />
        <div className="confirm-modal-message">{parseBoldText(message)}</div>
      </div>

      <ModalFooter className="confirm-modal-actions">
        <ButtonInput variant="secondary" onClick={handleCancel}>
          {cancelLabel}
        </ButtonInput>
        <ButtonInput variant={variant === 'info' ? 'primary' : variant} onClick={handleConfirm}>
          {confirmLabel}
        </ButtonInput>
      </ModalFooter>
    </Modal>
  );
};
