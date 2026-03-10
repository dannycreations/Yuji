import { Effect } from 'effect';

import { useStore, useStoreAction } from '../../../hooks/useStore';
import { parseBoldText } from '../../../utilities/CommonUtil';
import { ButtonInput } from '../InputArea';
import { Modal, ModalFooter, ModalHeader } from './Modal';

import type { FC } from 'react';

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
