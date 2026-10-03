import {
  Injectable,
  WritableSignal,
  Signal,
  signal,
  computed,
  inject,
} from '@angular/core';
import { ActiveUserService } from './active-user.service';

const DEFAULT_SHOW_HOME: boolean = true;
const DEFAULT_SHOW_BACK: boolean = true;

@Injectable({
  providedIn: 'root',
})
export class PageHeaderService {
  private readonly activeUserService = inject(ActiveUserService);

  private _showHome: WritableSignal<boolean> = signal(DEFAULT_SHOW_HOME);
  private _headline: WritableSignal<string> = signal('');
  private _subheader: WritableSignal<string> = signal('');
  private _back: WritableSignal<string> = signal('');
  private _showBack: WritableSignal<boolean> = signal(DEFAULT_SHOW_BACK);

  showUserOptions = computed(
    () => this.activeUserService.activeUser() !== null
  );

  set headline(headline: string) {
    this._headline.set(headline);
  }

  set subheader(subheader: string) {
    this._subheader.set(subheader);
  }

  get subheader(): Signal<string> {
    return this._subheader;
  }

  get showHome(): Signal<boolean> {
    return this._showHome;
  }

  get headline(): Signal<string> {
    return this._headline;
  }

  get back(): Signal<string> {
    return this._back;
  }

  get showBack(): Signal<boolean> {
    return this._showBack;
  }

  updateHeader(
    showHome: boolean,
    headline: string,
    back: string,
    showBack: boolean = DEFAULT_SHOW_BACK,
    subheader: string = ''
  ): void {
    this._showHome.set(showHome);
    this.headline = headline;
    this.subheader = subheader;
    this._back.set(back);
    this._showBack.set(showBack);
  }
}
