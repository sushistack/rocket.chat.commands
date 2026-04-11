import {
    IAppAccessors,
    IConfigurationExtend,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import {
    IUIKitInteractionHandler,
    UIKitBlockInteractionContext,
    UIKitViewSubmitInteractionContext,
    UIKitViewCloseInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitResponse } from '@rocket.chat/apps-engine/definition/uikit';

import { settings } from './src/settings';
import { ActionHandler } from './src/handlers/ActionHandler';
// Commands
import { TodayCommand } from './src/commands/TodayCommand';
import { BriefCommand } from './src/commands/BriefCommand';
import { StatsCommand } from './src/commands/StatsCommand';
import { CompleteCommand } from './src/commands/CompleteCommand';
import { CancelCommand } from './src/commands/CancelCommand';
import { DeferCommand } from './src/commands/DeferCommand';
import { RestoreCommand } from './src/commands/RestoreCommand';
import { AddCommand } from './src/commands/AddCommand';
import { DeferredCommand } from './src/commands/DeferredCommand';
import { WeeklyCommand } from './src/commands/WeeklyCommand';
import { SwapCommand } from './src/commands/SwapCommand';
import { MemoCommand } from './src/commands/MemoCommand';
import { RegenCommand } from './src/commands/RegenCommand';
import { HelpCommand } from './src/commands/HelpCommand';
import { GenerateCommand } from './src/commands/GenerateCommand';
import { ReportCommand } from './src/commands/ReportCommand';
import { DeleteCommand } from './src/commands/DeleteCommand';

// API
import { ApiSecurity, ApiVisibility } from '@rocket.chat/apps-engine/definition/api';
import { SchedulerTriggerEndpoint } from './src/api/SchedulerTriggerEndpoint';

export class PulsarApp extends App implements IUIKitInteractionHandler {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        // Register settings
        for (const setting of settings) {
            await configuration.settings.provideSetting(setting);
        }

        // Register slash commands
        await configuration.slashCommands.provideSlashCommand(new TodayCommand());
        await configuration.slashCommands.provideSlashCommand(new BriefCommand());
        await configuration.slashCommands.provideSlashCommand(new StatsCommand());
        await configuration.slashCommands.provideSlashCommand(new CompleteCommand(this));
        await configuration.slashCommands.provideSlashCommand(new CancelCommand(this));
        await configuration.slashCommands.provideSlashCommand(new DeferCommand(this));
        await configuration.slashCommands.provideSlashCommand(new RestoreCommand(this));
        await configuration.slashCommands.provideSlashCommand(new AddCommand());
        await configuration.slashCommands.provideSlashCommand(new DeferredCommand());
        await configuration.slashCommands.provideSlashCommand(new WeeklyCommand());
        await configuration.slashCommands.provideSlashCommand(new SwapCommand());
        await configuration.slashCommands.provideSlashCommand(new MemoCommand());
        await configuration.slashCommands.provideSlashCommand(new RegenCommand(this));
        await configuration.slashCommands.provideSlashCommand(new HelpCommand());
        await configuration.slashCommands.provideSlashCommand(new GenerateCommand());
        await configuration.slashCommands.provideSlashCommand(new ReportCommand());
        await configuration.slashCommands.provideSlashCommand(new DeleteCommand(this));

        // Register API endpoints (n8n triggers schedulers via HTTP)
        await configuration.api.provideApi({
            visibility: ApiVisibility.PUBLIC,
            security: ApiSecurity.UNSECURE,
            endpoints: [new SchedulerTriggerEndpoint(this)],
        });
    }

    public async onEnable(): Promise<boolean> {
        return true;
    }

    // UIKit block action handler (button clicks)
    public async executeBlockActionHandler(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const { actionId, user, room, triggerId, message } = data;

        const handler = new ActionHandler(this, read, http, modify);
        await handler.handleAction(
            actionId,
            user.id,
            room?.id || '',
            triggerId,
        );

        // 버튼 클릭 후 원래 메시지에서 버튼 제거
        if (message?.id) {
            try {
                const updater = await modify.getUpdater().message(message.id, user);
                updater.setBlocks(modify.getCreator().getBlockBuilder());
                await modify.getUpdater().finish(updater);
            } catch {
                // 메시지 업데이트 실패 시 무시
            }
        }

        return context.getInteractionResponder().successResponse();
    }

    // UIKit view submit handler (modal form submissions)
    public async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        return context.getInteractionResponder().successResponse();
    }

    // UIKit view close handler
    public async executeViewClosedHandler(
        context: UIKitViewCloseInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        return context.getInteractionResponder().successResponse();
    }
}
