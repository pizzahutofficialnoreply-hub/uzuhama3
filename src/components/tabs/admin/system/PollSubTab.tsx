import React from 'react';
import { AppData, SystemConfig } from '../../../../types';
import { AdminPollSection } from '../AdminPollSection';

interface PollSubTabProps {
  data: AppData;
  systemEdit: Partial<SystemConfig>;
  handleChange: (field: keyof SystemConfig, val: any) => void;
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void>;
}

export const PollSubTab: React.FC<PollSubTabProps> = ({
  data,
  systemEdit,
  handleChange,
  onUpdateSystemConfig
}) => {
  return (
    <div className="space-y-6">
      <AdminPollSection 
        system={systemEdit as SystemConfig}
        polls={data.polls || []}
        onUpdateSystemConfig={onUpdateSystemConfig}
      />
    </div>
  );
};
