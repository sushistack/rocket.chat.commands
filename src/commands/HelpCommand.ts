import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

export class HelpCommand implements ISlashCommand {
    public command = 'pulsar-help';
    public i18nParamsExample = '';
    public i18nDescription = 'Pulsar 명령어 도움말을 보여줍니다';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const text = [
            '📖 Pulsar 명령어 목록',
            '',
            '── 📋 일일 퀘스트 ──────────────────',
            '`/today`                 오늘의 퀘스트 현황',
            '`/add {이름} {시간} {소요}`  태스크 추가 (예: `/add 운동 07:00 45m`)',
            '`/complete`              퀘스트 완료 처리 (버튼)',
            '`/cancel`                퀘스트 취소 (버튼)',
            '`/defer`                 퀘스트 연기 (버튼)',
            '`/restore`               연기된 퀘스트 복원 (버튼)',
            '`/swap {A} {B}`          두 퀘스트 시간 교환',
            '`/memo {번호} {내용}`      퀘스트에 메모 추가',
            '',
            '── 📊 조회/분석 ──────────────────',
            '`/brief [all]`           마일스톤 브리핑 (상위 5개/전체)',
            '`/stats [N]`             최근 N일 통계 (기본 7일)',
            '`/deferred`              연기된 퀘스트 목록',
            '`/weekly`                주간 리포트',
            '`/report`                오늘 일일 리포트',
            '',
            '── ⚙️ 생성/관리 ──────────────────',
            '`/gen`                   오늘 퀘스트 생성 (루틴 복사)',
            '`/regen`                 퀘스트 초기화 후 재생성',
            '',
            '── ℹ️ 기타 ──────────────────',
            '`/pulsar-help`           이 도움말 보기',
        ].join('\n');

        const msg = modify.getCreator().startMessage()
            .setRoom(context.getRoom())
            .setText(text);
        await modify.getCreator().finish(msg);
    }
}
