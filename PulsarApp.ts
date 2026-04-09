import {
    IAppAccessors,
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
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

// Schedulers
import { DailyQuestGenerator } from './src/schedulers/DailyQuestGenerator';
import { DailySummaryReporter } from './src/schedulers/DailySummaryReporter';
import { DeferredCleanup } from './src/schedulers/DeferredCleanup';
import { StartupType } from '@rocket.chat/apps-engine/definition/scheduler';

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
        await configuration.slashCommands.provideSlashCommand(new CompleteCommand());
        await configuration.slashCommands.provideSlashCommand(new CancelCommand());
        await configuration.slashCommands.provideSlashCommand(new DeferCommand());
        await configuration.slashCommands.provideSlashCommand(new RestoreCommand());
        await configuration.slashCommands.provideSlashCommand(new AddCommand());
        await configuration.slashCommands.provideSlashCommand(new DeferredCommand());
        await configuration.slashCommands.provideSlashCommand(new WeeklyCommand());
        await configuration.slashCommands.provideSlashCommand(new SwapCommand());
        await configuration.slashCommands.provideSlashCommand(new MemoCommand());
        await configuration.slashCommands.provideSlashCommand(new RegenCommand());
        await configuration.slashCommands.provideSlashCommand(new HelpCommand());
        await configuration.slashCommands.provideSlashCommand(new GenerateCommand());
        await configuration.slashCommands.provideSlashCommand(new ReportCommand());
        await configuration.slashCommands.provideSlashCommand(new DeleteCommand());

        // Register schedulers
        await configuration.scheduler.registerProcessors([
            new DailyQuestGenerator(),
            new DailySummaryReporter(),
            new DeferredCleanup(),
        ]);
    }

    public async onEnable(
        environment: IEnvironmentRead,
        configurationModify: IConfigurationModify,
    ): Promise<boolean> {
        // Schedule cron jobs (KST = UTC+9, so 00:00 KST = 15:00 UTC prev day)
        const scheduler = configurationModify.scheduler;

        // 서버 TZ=Asia/Seoul → cron은 KST 기준으로 해석됨
        // W1: Daily quest generator — 매일 00:01 KST (cleanup과 겹침 방지)
        await scheduler.scheduleRecurring({
            id: 'daily-quest-generator',
            interval: '1 0 * * *',
        });

        // W3: Daily summary reporter — 매일 23:00 KST
        await scheduler.scheduleRecurring({
            id: 'daily-summary-reporter',
            interval: '0 23 * * *',
        });

        // W4: Deferred cleanup — 매주 일요일 00:00 KST
        await scheduler.scheduleRecurring({
            id: 'deferred-cleanup',
            interval: '0 0 * * 0',
        });

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
        const data = context.getInteractionData();
        const { view } = data;

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
